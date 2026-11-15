import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as thumb } from "@/app/api/immich/assets/[assetId]/thumb/route";
import { GET as search } from "@/app/api/immich/assets/route";
import {
	PUT as connect,
	DELETE as disconnect,
	GET as status,
} from "@/app/api/immich/route";
import { GET as variant } from "@/app/api/outfits/[id]/immich-assets/[linkId]/[variant]/route";
import { DELETE as unlink } from "@/app/api/outfits/[id]/immich-assets/[linkId]/route";
import { POST as link } from "@/app/api/outfits/[id]/immich-assets/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { makeOutfit, shareOutfit } from "@/test/helpers/outfits";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

const assetId = "a0000000-0000-4000-8000-000000000001";
const immichId = "a0000000-0000-4000-8000-000000000002";
const actor = (s: string) => ({
	...OTHER_USER,
	sub: s,
	email: `${s}@example.com`,
	username: s,
});
const view = actor("view"),
	editor = actor("editor"),
	direct = actor("direct"),
	locationUser = actor("location");
const actors = [TEST_USER, view, editor, direct, locationUser, THIRD_USER];
describeWithDb("Immich contract review", () => {
	beforeEach(async () => {
		await resetDb();
		process.env.IMMICH_URL = "https://immich.example";
		process.env.SECRETS_KEY = Buffer.alloc(32, 1).toString("base64");
		resetEnvCache();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		delete process.env.IMMICH_URL;
		delete process.env.SECRETS_KEY;
		resetEnvCache();
	});
	it("uses each caller's key for picker and the linker's key for streamed variants", async () => {
		const calls: { path: string; key: string }[] = [];
		let upstream: Response | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				const path = String(url),
					key = (init.headers as Record<string, string>)["x-api-key"] ?? "";
				calls.push({ path, key });
				if (path.endsWith("/users/me"))
					return Response.json({
						id: immichId,
						email: "x@example.com",
						name: "X",
					});
				if (path.includes("/thumbnail")) {
					upstream = new Response(
						new ReadableStream({
							start(c) {
								c.enqueue(new TextEncoder().encode("image"));
								c.close();
							},
						}),
						{
							headers: {
								"content-type": "image/jpeg",
								"content-length": "5",
								"set-cookie": "private",
								"x-secret": "private",
							},
						},
					);
					return upstream;
				}
				if (path.includes("/search/"))
					return Response.json({
						assets: {
							items: [{ id: assetId, ownerId: immichId, type: "IMAGE" }],
							nextPage: null,
						},
					});
				return Response.json({
					id: assetId,
					ownerId: immichId,
					type: "IMAGE",
					originalFileName: "x.jpg",
					width: 2,
					height: 3,
					thumbhash: null,
					fileCreatedAt: "2024-01-01T00:00:00Z",
				});
			}),
		);
		const logs = vi.spyOn(console, "error").mockImplementation(() => {});
		for (const [user, key] of [
			[TEST_USER, "owner-secret"],
			[direct, "viewer-secret"],
		] as const) {
			const response = await connect(
				apiRequest("/api/immich", {
					user,
					method: "PUT",
					body: { apiKey: key },
				}),
				{},
			);
			expect(await response.text()).not.toContain(key);
		}
		const response = await search(
			apiRequest("/api/immich/assets", { user: direct }),
			{},
		);
		expect(await response.text()).not.toContain("viewer-secret");
		expect(calls.at(-1)?.key).toBe("viewer-secret");
		await thumb(apiRequest("/", { user: direct }), routeParams({ assetId }));
		expect(calls.slice(-2).map((c) => c.key)).toEqual([
			"viewer-secret",
			"viewer-secret",
		]);
		const outfit = await makeOutfit();
		await shareOutfit(outfit.id, await userId(direct));
		const linked = await json<{ id: string }[]>(
			await link(
				apiRequest("/", { method: "POST", body: { assetIds: [assetId] } }),
				routeParams({ id: outfit.id }),
			),
		);
		const r = await variant(
			apiRequest("/", { user: direct }),
			routeParams({
				id: outfit.id,
				linkId: linked[0]?.id ?? "",
				variant: "display",
			}),
		);
		expect(calls.at(-1)?.key).toBe("owner-secret");
		expect(r.body).toBe(upstream?.body);
		expect(r.headers.get("content-type")).toBe("image/jpeg");
		expect(r.headers.get("content-length")).toBe("5");
		expect(r.headers.get("set-cookie")).toBeNull();
		expect(r.headers.get("x-secret")).toBeNull();
		expect(r.headers.get("cache-control")).toBe("private, max-age=300");
		expect(await r.text()).toBe("image");
		expect(JSON.stringify(logs.mock.calls)).not.toMatch(
			/owner-secret|viewer-secret/,
		);
	});
	it("returns contract error codes without exposing key material", async () => {
		const logs = vi.spyOn(console, "error").mockImplementation(() => {});
		const check = async (r: Response, code: string, statusCode: number) => {
			expect(r.status).toBe(statusCode);
			const text = await r.text();
			expect(JSON.parse(text).error).toBe(code);
			expect(text).not.toContain("secret-key");
		};
		delete process.env.IMMICH_URL;
		resetEnvCache();
		await check(await status(apiRequest("/"), {}), "immich_disabled", 409);
		await check(await search(apiRequest("/"), {}), "immich_disabled", 409);
		process.env.IMMICH_URL = "https://immich.example";
		resetEnvCache();
		await check(await search(apiRequest("/"), {}), "immich_not_connected", 409);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 401 })),
		);
		await check(
			await connect(
				apiRequest("/", { method: "PUT", body: { apiKey: "secret-key" } }),
				{},
			),
			"immich_key_rejected",
			422,
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ id: immichId, email: "x", name: "x" })),
		);
		await connect(
			apiRequest("/", { method: "PUT", body: { apiKey: "secret-key" } }),
			{},
		);
		for (const statusCode of [401, 403, 500]) {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(null, { status: statusCode })),
			);
			await check(await search(apiRequest("/"), {}), "immich_unavailable", 502);
		}
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("secret-key");
			}),
		);
		await check(await search(apiRequest("/"), {}), "immich_unavailable", 502);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 404 })),
		);
		expect(
			(await thumb(apiRequest("/"), routeParams({ assetId }))).status,
		).toBe(404);
		expect(JSON.stringify(logs.mock.calls)).not.toContain("secret-key");
		expect(
			(await disconnect(apiRequest("/", { method: "DELETE" }), {})).status,
		).toBe(204);
	});
	it("enforces outfit permissions for link, unlink and variants", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).endsWith("/users/me")
					? Response.json({ id: immichId, email: "x", name: "x" })
					: String(url).includes("thumbnail")
						? new Response("image")
						: Response.json({ id: assetId, ownerId: immichId, type: "IMAGE" }),
			),
		);
		for (const user of [TEST_USER, editor])
			await connect(
				apiRequest("/", { user, method: "PUT", body: { apiKey: "key" } }),
				{},
			);
		const loc = await makeLocation();
		await share(TEST_USER, view, "view");
		await share(TEST_USER, editor, "edit");
		await share(TEST_USER, locationUser, "edit", loc.id);
		const outfit = await makeOutfit();
		await shareOutfit(outfit.id, await userId(direct));
		for (const [i, user] of actors.entries()) {
			const row = await db().outfitImmichAsset.create({
				data: {
					outfitId: outfit.id,
					linkedById: await userId(),
					assetId: crypto.randomUUID(),
				},
			});
			const params = routeParams({ id: outfit.id, linkId: row.id });
			expect(
				(
					await variant(
						apiRequest("/", { user }),
						routeParams({ id: outfit.id, linkId: row.id, variant: "thumb" }),
					)
				).status,
			).toBe([200, 200, 200, 200, 404, 404][i]);
			expect(
				(
					await link(
						apiRequest("/", {
							user,
							method: "POST",
							body: { assetIds: [assetId] },
						}),
						routeParams({ id: outfit.id }),
					)
				).status,
			).toBe([201, 403, 201, 403, 404, 404][i]);
			expect(
				(await unlink(apiRequest("/", { user, method: "DELETE" }), params))
					.status,
			).toBe([204, 403, 204, 403, 404, 404][i]);
		}
	});
	it("rejects unreadable linked assets and returns 404 when a linked asset disappears", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).endsWith("/users/me")
					? Response.json({ id: immichId, email: "x", name: "x" })
					: new Response(null, { status: 404 }),
			),
		);
		await connect(
			apiRequest("/", { method: "PUT", body: { apiKey: "key" } }),
			{},
		);
		const outfit = await makeOutfit();
		expect(
			(
				await link(
					apiRequest("/", { method: "POST", body: { assetIds: [assetId] } }),
					routeParams({ id: outfit.id }),
				)
			).status,
		).toBe(422);
		const row = await db().outfitImmichAsset.create({
			data: { outfitId: outfit.id, linkedById: outfit.ownerId, assetId },
		});
		expect(
			(
				await variant(
					apiRequest("/"),
					routeParams({ id: outfit.id, linkId: row.id, variant: "thumb" }),
				)
			).status,
		).toBe(404);
	});
});
