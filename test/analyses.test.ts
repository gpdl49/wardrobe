import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as applyRoute } from "@/app/api/items/[id]/analyses/[analysisId]/apply/route";
import {
	GET as listRoute,
	POST as rerunRoute,
} from "@/app/api/items/[id]/analyses/route";
import {
	enqueuePhotoAnalyses,
	STALE_AFTER_MS,
	VISION_DELAY_SECONDS,
} from "@/lib/analyses/enqueue";
import { runColorsAnalysis, runVisionAnalysis } from "@/lib/analyses/run";
import type { AnalysisDto, ItemDetailDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import { enqueue } from "@/lib/jobs/queue";
import { getObjectBytes } from "@/lib/s3";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams } from "@/test/helpers/http";

vi.mock("@/lib/jobs/queue", () => ({
	enqueue: vi.fn(async () => "job-id"),
}));
vi.mock("@/lib/s3", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/s3")>()),
	getObjectBytes: vi.fn(),
}));

const enqueueMock = vi.mocked(enqueue);
const getObjectBytesMock = vi.mocked(getObjectBytes);

const MISSING = "0190f5a0-0000-7000-8000-000000000000";

function setApiKey(key: string | undefined) {
	if (key === undefined) delete process.env.OPENROUTER_API_KEY;
	else process.env.OPENROUTER_API_KEY = key;
	resetEnvCache();
}

async function makePhoto(data: Partial<Prisma.PhotoUncheckedCreateInput> = {}) {
	return db().photo.create({
		data: {
			kind: "main",
			status: "ready",
			contentType: "image/jpeg",
			size: 1000,
			...data,
		},
	});
}

/** A navy rectangle on white, as a PNG. */
const navyPhoto = () =>
	sharp(
		Buffer.from(
			`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#fff"/><rect x="75" y="50" width="150" height="100" fill="#1b2540"/></svg>`,
		),
	)
		.png()
		.toBuffer()
		.then((b) => new Uint8Array(b));

const jobNames = () =>
	enqueueMock.mock.calls.map(([job, data, options]) => ({
		name: job.name,
		data,
		options,
	}));

const analysesOf = (itemId: string) =>
	db().analysis.findMany({
		where: { itemId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});

describeWithDb("analyses", () => {
	beforeEach(async () => {
		await resetDb();
		enqueueMock.mockReset();
		enqueueMock.mockResolvedValue("job-id");
		getObjectBytesMock.mockReset();
		setApiKey(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		setApiKey(undefined);
	});

	describe("enqueuePhotoAnalyses", () => {
		it("skips photos without an item", async () => {
			const photo = await makePhoto();
			expect(await enqueuePhotoAnalyses(photo)).toEqual([]);
			expect(enqueueMock).not.toHaveBeenCalled();
		});

		it("queues colours only for a main photo when vision is disabled", async () => {
			const item = await makeItem();
			const photo = await makePhoto({ itemId: item.id });
			const created = await enqueuePhotoAnalyses(photo);
			expect(created).toHaveLength(1);
			expect(created[0]).toMatchObject({
				kind: "colors",
				status: "queued",
				photoId: photo.id,
				model: "kmeans-lab-v1",
			});
			expect(jobNames()).toEqual([
				{
					name: "analysis.colors",
					data: { analysisId: created[0]?.id },
					options: undefined,
				},
			]);
		});

		it("queues colours and a delayed vision analysis for a main photo", async () => {
			setApiKey("sk-or-test");
			const item = await makeItem();
			const photo = await makePhoto({ itemId: item.id });
			const created = await enqueuePhotoAnalyses(photo);
			expect(created.map((a) => a.kind)).toEqual(["colors", "vision"]);
			expect(created[1]).toMatchObject({
				model: "google/gemini-3.1-flash-lite",
				photoId: photo.id,
			});
			expect(jobNames().map((j) => [j.name, j.options])).toEqual([
				["analysis.colors", undefined],
				["analysis.vision", { startAfter: VISION_DELAY_SECONDS }],
			]);
		});

		it("queues only vision for a label photo and nothing for a detail photo", async () => {
			setApiKey("sk-or-test");
			const item = await makeItem();
			const label = await makePhoto({ itemId: item.id, kind: "label" });
			expect((await enqueuePhotoAnalyses(label)).map((a) => a.kind)).toEqual([
				"vision",
			]);
			const other = await makeItem();
			const detail = await makePhoto({ itemId: other.id, kind: "detail" });
			expect(await enqueuePhotoAnalyses(detail)).toEqual([]);
		});

		it("does not add a vision analysis while one is queued or running", async () => {
			setApiKey("sk-or-test");
			const item = await makeItem();
			const first = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			const second = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id, kind: "label" }),
			);
			expect(second).toEqual([]);
			await db().analysis.update({
				where: { id: first[1]?.id },
				data: { status: "running" },
			});
			const third = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			expect(third.map((a) => a.kind)).toEqual(["colors"]);
			const vision = (await analysesOf(item.id)).filter(
				(a) => a.kind === "vision",
			);
			expect(vision).toHaveLength(1);
		});

		it("adds vision again once the previous one finished or went stale", async () => {
			setApiKey("sk-or-test");
			const item = await makeItem();
			const [, vision] = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			await db().analysis.update({
				where: { id: vision?.id },
				data: { status: "done", result: {} },
			});
			const again = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id, kind: "label" }),
			);
			expect(again).toHaveLength(1);
			// A run that died mid-job does not block forever.
			await db()
				.$executeRaw`UPDATE analyses SET status = 'running', updated_at = ${new Date(Date.now() - STALE_AFTER_MS - 1000)} WHERE id = ${again[0]?.id}::uuid`;
			const third = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id, kind: "label" }),
			);
			expect(third).toHaveLength(1);
		});

		it("makes one vision analysis when photos complete concurrently", async () => {
			setApiKey("sk-or-test");
			const item = await makeItem();
			const photos = await Promise.all(
				[1, 2, 3].map(() => makePhoto({ itemId: item.id, kind: "label" })),
			);
			const results = await Promise.all(photos.map(enqueuePhotoAnalyses));
			expect(results.flat()).toHaveLength(1);
			expect(await db().analysis.count({ where: { kind: "vision" } })).toBe(1);
		});

		it("marks the analysis failed when the queue is down", async () => {
			enqueueMock.mockRejectedValue(new Error("connection refused"));
			vi.spyOn(console, "error").mockImplementation(() => {});
			const item = await makeItem();
			const [analysis] = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			expect(analysis).toMatchObject({
				status: "failed",
				error: "Could not enqueue: connection refused",
			});
		});
	});

	describe("colours job", () => {
		it("extracts colours from the display rendition", async () => {
			getObjectBytesMock.mockImplementation(async () => navyPhoto());
			const item = await makeItem();
			const [analysis] = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			await runColorsAnalysis(analysis?.id as string);
			const done = await db().analysis.findUniqueOrThrow({
				where: { id: analysis?.id },
			});
			expect(done.status).toBe("done");
			expect(done.result).toEqual({
				colors: [{ name: "navy", hex: expect.any(String), share: 1 }],
			});
			expect(getObjectBytesMock).toHaveBeenCalledWith(
				`photos/${analysis?.photoId}/display.webp`,
			);
		});

		it("falls back to the original and records failures", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			getObjectBytesMock.mockImplementation(async (key) => {
				if (key.endsWith("display.webp")) throw new Error("NoSuchKey");
				return new Uint8Array([1, 2, 3]); // not an image
			});
			const item = await makeItem();
			const [analysis] = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			await runColorsAnalysis(analysis?.id as string);
			expect(getObjectBytesMock).toHaveBeenLastCalledWith(
				`photos/${analysis?.photoId}/original`,
			);
			const failed = await db().analysis.findUniqueOrThrow({
				where: { id: analysis?.id },
			});
			expect(failed.status).toBe("failed");
			expect(failed.error).toMatch(/^Colour extraction failed/);
		});

		it("ignores analyses that are not queued", async () => {
			await runColorsAnalysis(MISSING);
			expect(getObjectBytesMock).not.toHaveBeenCalled();
		});
	});

	describe("vision job", () => {
		async function setUp() {
			setApiKey("sk-or-test");
			getObjectBytesMock.mockImplementation(async () => navyPhoto());
			const knitwear = await db().category.create({
				data: { name: "Knitwear", slug: "knitwear" },
			});
			await db().category.create({
				data: { name: "Jumpers", slug: "jumpers", parentId: knitwear.id },
			});
			const item = await makeItem();
			await makePhoto({ itemId: item.id, kind: "label" });
			const [, vision] = await enqueuePhotoAnalyses(
				await makePhoto({ itemId: item.id }),
			);
			return { item, vision: vision as NonNullable<typeof vision> };
		}

		const reply = (content: unknown) =>
			vi.fn<typeof fetch>(async () =>
				Response.json({
					model: "google/gemini-3.1-flash-lite",
					choices: [
						{
							message: {
								content:
									typeof content === "string"
										? content
										: JSON.stringify(content),
							},
						},
					],
				}),
			);

		it("sends main then label photos and stores the validated suggestion", async () => {
			const { vision } = await setUp();
			const fetchMock = reply({
				name: "Navy jumper",
				categorySlug: "jumpers",
				brand: null,
				size: "M",
				pattern: "solid",
				material: "wool",
				seasons: ["winter"],
				tags: ["Crew Neck"],
				labelText: "M\n100% wool",
			});
			await runVisionAnalysis(vision.id, { fetch: fetchMock });

			const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
			expect(body.model).toBe("google/gemini-3.1-flash-lite");
			expect(
				body.response_format.json_schema.schema.properties.categorySlug.enum,
			).toEqual(["knitwear", "jumpers", null]);
			const parts = body.messages[1].content;
			expect(parts[0].text).toContain("jumpers: Knitwear > Jumpers");
			expect(
				parts.filter((p: { type: string }) => p.type === "text").slice(1),
			).toEqual([
				{ type: "text", text: "Photo 1 (main):" },
				{ type: "text", text: "Photo 2 (label):" },
			]);
			const images = parts.filter(
				(p: { type: string }) => p.type === "image_url",
			);
			expect(images).toHaveLength(2);
			expect(images[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);

			const done = await db().analysis.findUniqueOrThrow({
				where: { id: vision.id },
			});
			expect(done.status).toBe("done");
			expect(done.result).toEqual({
				name: "Navy jumper",
				categorySlug: "jumpers",
				size: "M",
				pattern: "solid",
				material: "wool",
				seasons: ["winter"],
				tags: ["crew neck"],
				labelText: "M\n100% wool",
			});
		});

		it("fails with the raw output on an unknown category", async () => {
			const { vision } = await setUp();
			await runVisionAnalysis(vision.id, {
				fetch: reply({ name: "Jumper", categorySlug: "sweaters" }),
			});
			const failed = await db().analysis.findUniqueOrThrow({
				where: { id: vision.id },
			});
			expect(failed.status).toBe("failed");
			expect(failed.error).toMatch(/categorySlug/);
			expect(failed.result).toEqual({
				raw: { name: "Jumper", categorySlug: "sweaters" },
			});
		});

		it("fails on malformed output and on API errors", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const { item, vision } = await setUp();
			await runVisionAnalysis(vision.id, { fetch: reply("not json") });
			expect(
				await db().analysis.findUniqueOrThrow({ where: { id: vision.id } }),
			).toMatchObject({
				status: "failed",
				error: "Model returned invalid JSON",
			});

			const second = await db().analysis.create({
				data: { itemId: item.id, kind: "vision" },
			});
			await runVisionAnalysis(second.id, {
				fetch: vi.fn<typeof fetch>(async () =>
					Response.json(
						{ error: { message: "Key limit exceeded" } },
						{ status: 402 },
					),
				),
			});
			expect(
				await db().analysis.findUniqueOrThrow({ where: { id: second.id } }),
			).toMatchObject({
				status: "failed",
				error: "Vision analysis failed: OpenRouter 402: Key limit exceeded",
			});
		});

		it("fails without an API key", async () => {
			const { vision } = await setUp();
			setApiKey(undefined);
			const fetchMock = reply({});
			await runVisionAnalysis(vision.id, { fetch: fetchMock });
			expect(fetchMock).not.toHaveBeenCalled();
			expect(
				await db().analysis.findUniqueOrThrow({ where: { id: vision.id } }),
			).toMatchObject({ status: "failed" });
		});
	});

	describe("GET/POST /api/items/{id}/analyses", () => {
		const list = (id: string) =>
			listRoute(apiRequest(`/api/items/${id}/analyses`), routeParams({ id }));
		const rerun = (id: string, body?: unknown) =>
			rerunRoute(
				apiRequest(`/api/items/${id}/analyses`, { method: "POST", body }),
				routeParams({ id }),
			);

		it("lists an item's analyses newest first and 404s unknown items", async () => {
			const item = await makeItem();
			await makePhoto({ itemId: item.id });
			await rerun(item.id);
			await rerun(item.id);
			const response = await list(item.id);
			expect(response.status).toBe(200);
			const body = await json<AnalysisDto[]>(response);
			expect(body).toHaveLength(2);
			expect((body[0]?.createdAt ?? "") >= (body[1]?.createdAt ?? "")).toBe(
				true,
			);
			expect((await list(MISSING)).status).toBe(404);
			expect((await list("nope")).status).toBe(404);
		});

		it("re-runs the default kinds", async () => {
			setApiKey("sk-or-test");
			const item = await makeItem();
			await makePhoto({ itemId: item.id });
			await makePhoto({ itemId: item.id, kind: "label" });
			await makePhoto({ itemId: item.id, status: "processing" });
			const response = await rerun(item.id);
			expect(response.status).toBe(202);
			const body = await json<AnalysisDto[]>(response);
			expect(body.map((a) => [a.kind, a.status])).toEqual([
				["colors", "queued"],
				["vision", "queued"],
			]);
			// Re-runs start immediately (no batching delay).
			expect(jobNames().map((j) => j.options)).toEqual([undefined, {}]);
			// Vision is debounced: a second re-run returns the one in flight.
			const again = await json<AnalysisDto[]>(
				await rerun(item.id, { kinds: ["vision"] }),
			);
			expect(again.map((a) => a.id)).toEqual([body[1]?.id]);
		});

		it("409s when vision is disabled or nothing can be analysed", async () => {
			const item = await makeItem();
			await makePhoto({ itemId: item.id, kind: "label" });
			expect((await rerun(item.id, { kinds: ["vision"] })).status).toBe(409);
			// Colours need a main photo.
			expect((await rerun(item.id)).status).toBe(409);
			expect((await rerun(item.id, { kinds: ["sizes"] })).status).toBe(400);
			expect((await rerun(MISSING)).status).toBe(404);
		});
	});

	describe("POST /api/items/{id}/analyses/{analysisId}/apply", () => {
		const apply = (id: string, analysisId: string, body: unknown) =>
			applyRoute(
				apiRequest(`/api/items/${id}/analyses/${analysisId}/apply`, {
					method: "POST",
					body,
				}),
				routeParams({ id, analysisId }),
			);

		const result = {
			name: "Navy jumper",
			categorySlug: "jumpers",
			brand: "Uniqlo",
			size: "M",
			colors: [{ name: "navy", hex: "#1f2a44", share: 1 }],
			pattern: "solid",
			material: "wool",
			seasons: ["winter", "autumn"],
			tags: ["knit", "crew neck"],
			labelText: "UNIQLO M 100% wool",
		};

		async function setUp(status: "done" | "running" = "done") {
			const jumpers = await db().category.create({
				data: { name: "Jumpers", slug: "jumpers" },
			});
			const knit = await db().tag.create({ data: { name: "knit" } });
			const old = await db().tag.create({ data: { name: "old" } });
			const item = await makeItem({
				name: "Something",
				brand: "Keep",
				notes: "Bought in 2020",
				tags: { create: [{ tagId: knit.id }, { tagId: old.id }] },
			});
			const analysis = await db().analysis.create({
				data: { itemId: item.id, kind: "vision", status, result },
			});
			return { item, analysis, jumpers };
		}

		it("applies the chosen fields and merges tags and notes", async () => {
			const { item, analysis, jumpers } = await setUp();
			const response = await apply(item.id, analysis.id, {
				fields: [
					"name",
					"categorySlug",
					"size",
					"colors",
					"pattern",
					"material",
					"seasons",
					"tags",
					"labelText",
				],
			});
			expect(response.status).toBe(200);
			const body = await json<ItemDetailDto>(response);
			expect(body).toMatchObject({
				id: item.id,
				name: "Navy jumper",
				brand: "Keep",
				size: "M",
				category: { id: jumpers.id, slug: "jumpers" },
				colors: [{ name: "navy", hex: "#1f2a44", share: 1 }],
				pattern: "solid",
				material: "wool",
				seasons: ["autumn", "winter"],
				tags: ["crew neck", "knit", "old"],
				notes: "Bought in 2020\n\nUNIQLO M 100% wool",
			});
			expect(body.analyses[0]?.appliedAt).toEqual(expect.any(String));
			expect(await db().tag.count({ where: { name: "crew neck" } })).toBe(1);

			// Applying label text again does not duplicate it.
			const again = await json<ItemDetailDto>(
				await apply(item.id, analysis.id, { fields: ["labelText"] }),
			);
			expect(again.notes).toBe("Bought in 2020\n\nUNIQLO M 100% wool");
		});

		it("skips fields the analysis did not suggest", async () => {
			const { item } = await setUp();
			const colours = await db().analysis.create({
				data: {
					itemId: item.id,
					kind: "colors",
					status: "done",
					result: { colors: result.colors },
				},
			});
			const body = await json<ItemDetailDto>(
				await apply(item.id, colours.id, { fields: ["colors", "brand"] }),
			);
			expect(body.brand).toBe("Keep");
			expect(body.colors).toEqual(result.colors);
		});

		it("rejects analyses that are not done, missing or of another item", async () => {
			const { item, analysis } = await setUp("running");
			expect(
				(await apply(item.id, analysis.id, { fields: ["name"] })).status,
			).toBe(409);
			const other = await makeItem();
			expect(
				(await apply(other.id, analysis.id, { fields: ["name"] })).status,
			).toBe(404);
			expect((await apply(item.id, MISSING, { fields: ["name"] })).status).toBe(
				404,
			);
			expect((await apply(item.id, analysis.id, { fields: [] })).status).toBe(
				400,
			);
			expect(
				(await apply(item.id, analysis.id, { fields: ["status"] })).status,
			).toBe(400);
		});

		it("422s when the suggested category was deleted", async () => {
			const { item, analysis, jumpers } = await setUp();
			await db().category.delete({ where: { id: jumpers.id } });
			const response = await apply(item.id, analysis.id, {
				fields: ["name", "categorySlug"],
			});
			expect(response.status).toBe(422);
			// Nothing was written.
			const unchanged = await db().item.findUniqueOrThrow({
				where: { id: item.id },
			});
			expect(unchanged.name).toBe("Something");
			expect(
				(await db().analysis.findUniqueOrThrow({ where: { id: analysis.id } }))
					.appliedAt,
			).toBeNull();
		});
	});
});
