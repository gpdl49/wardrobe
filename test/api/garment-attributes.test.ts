import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as apply } from "@/app/api/items/analyses/apply-tags/route";
import { POST as queue } from "@/app/api/items/analyses/route";
import { GET as listItems } from "@/app/api/items/route";
import { VISION_PROMPT_REVISION } from "@/lib/analyses/vision";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, json } from "@/test/helpers/http";

vi.mock("@/lib/jobs/queue", () => ({ enqueue: vi.fn(async () => "job") }));

async function withReadyPhoto(item: { id: string; ownerId: string }) {
	await db().photo.create({
		data: {
			ownerId: item.ownerId,
			itemId: item.id,
			kind: "main",
			status: "ready",
			contentType: "image/jpeg",
			size: 1,
		},
	});
}

const post = (path: string, body: unknown) =>
	apiRequest(path, { method: "POST", body });

describeWithDb("garment attributes and bulk apply", () => {
	beforeEach(async () => {
		await resetDb();
		process.env.OPENROUTER_API_KEY = "test-key";
		resetEnvCache();
	});
	afterEach(() => {
		delete process.env.OPENROUTER_API_KEY;
		resetEnvCache();
	});

	it("re-queues items analysed before the prompt revision, not after", async () => {
		const stale = await makeItem({ name: "stale" });
		const current = await makeItem({ name: "current" });
		await withReadyPhoto(stale);
		await withReadyPhoto(current);
		const before = new Date(VISION_PROMPT_REVISION.getTime() - 86_400_000);
		await db().analysis.create({
			data: {
				itemId: stale.id,
				kind: "vision",
				status: "done",
				createdAt: before,
			},
		});
		await db().analysis.create({
			data: { itemId: current.id, kind: "vision", status: "done" },
		});
		expect(
			await json(await queue(post("/api/items/analyses", {}), undefined)),
		).toEqual({ queued: 1 });
		const queued = await db().analysis.findMany({
			where: { status: "queued" },
		});
		expect(queued.map((a) => a.itemId)).toEqual([stale.id]);
		// A second click finds nothing left to do.
		expect(
			await json(await queue(post("/api/items/analyses", {}), undefined)),
		).toEqual({ queued: 0 });
	});

	it("applies tags only by default", async () => {
		const item = await makeItem();
		await db().analysis.create({
			data: {
				itemId: item.id,
				kind: "vision",
				status: "done",
				result: { tags: ["v-neck"], pattern: "striped" },
			},
		});
		expect(
			await json(
				await apply(post("/api/items/analyses/apply-tags", {}), undefined),
			),
		).toEqual({ updated: 1 });
		const after = await db().item.findUniqueOrThrow({
			where: { id: item.id },
			include: { tags: { include: { tag: true } } },
		});
		expect(after.tags.map((t) => t.tag.name)).toEqual(["v-neck"]);
		expect(after.pattern).toBeNull();
	});

	it("fills empty pattern, material and seasons but never overwrites", async () => {
		const empty = await makeItem({ name: "empty" });
		const filled = await makeItem({ name: "filled" });
		await db().item.update({
			where: { id: filled.id },
			data: { pattern: "solid", material: "linen", seasons: ["summer"] },
		});
		for (const item of [empty, filled]) {
			await db().analysis.create({
				data: {
					itemId: item.id,
					kind: "vision",
					status: "done",
					result: {
						tags: ["long sleeve"],
						pattern: "striped",
						material: "100% cotton",
						seasons: ["winter", "autumn"],
					},
				},
			});
		}
		expect(
			await json(
				await apply(
					post("/api/items/analyses/apply-tags", {
						fields: ["tags", "pattern", "material", "seasons"],
					}),
					undefined,
				),
			),
		).toEqual({ updated: 2 });
		const read = (id: string) =>
			db().item.findUniqueOrThrow({
				where: { id },
				select: { pattern: true, material: true, seasons: true },
			});
		expect(await read(empty.id)).toEqual({
			pattern: "striped",
			material: "100% cotton",
			seasons: ["autumn", "winter"],
		});
		expect(await read(filled.id)).toEqual({
			pattern: "solid",
			material: "linen",
			seasons: ["summer"],
		});
		expect(await db().itemTag.count()).toBe(2);
	});

	it("rejects unknown fields", async () => {
		const response = await apply(
			post("/api/items/analyses/apply-tags", { fields: ["name"] }),
			undefined,
		);
		expect(response.status).toBe(400);
	});

	it("finds items by pattern in search", async () => {
		const striped = await makeItem({ name: "Shirt" });
		await makeItem({ name: "Other" });
		await db().item.update({
			where: { id: striped.id },
			data: { pattern: "striped" },
		});
		const body = await json<{ items: { id: string }[] }>(
			await listItems(apiRequest("/api/items?q=stripe"), undefined),
		);
		expect(body.items.map((i) => i.id)).toEqual([striped.id]);
	});
});
