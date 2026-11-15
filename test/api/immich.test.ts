import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as thumb } from "@/app/api/immich/assets/[assetId]/thumb/route";
import { DELETE, PUT } from "@/app/api/immich/route";
import { GET as variant } from "@/app/api/outfits/[id]/immich-assets/[linkId]/[variant]/route";
import { POST as link } from "@/app/api/outfits/[id]/immich-assets/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { apiRequest, json, routeParams } from "@/test/helpers/http";
import { OTHER_USER, userId } from "@/test/helpers/users";

const assetId = "a0000000-0000-4000-8000-000000000001";
const immichUser = "a0000000-0000-4000-8000-000000000002";
describeWithDb("Immich routes", () => {
	beforeEach(async () => {
		await resetDb();
		process.env.IMMICH_URL = "https://immich.example";
		process.env.SECRETS_KEY = Buffer.alloc(32, 1).toString("base64");
		resetEnvCache();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.IMMICH_URL;
		delete process.env.SECRETS_KEY;
		resetEnvCache();
	});
	it("encrypts keys, links idempotently and streams using the linker's key", async () => {
		const fetcher = vi.fn(
			async (url: string | URL | Request, init?: RequestInit) => {
				const path = String(url);
				if (path.endsWith("/users/me"))
					return Response.json({
						id: immichUser,
						email: "a@example.com",
						name: "A",
					});
				if (path.includes("/thumbnail"))
					return new Response("image", {
						headers: {
							"content-type": "image/jpeg",
							"content-length": "5",
							"set-cookie": "secret=1",
						},
					});
				expect(
					(init?.headers as Record<string, string> | undefined)?.["x-api-key"],
				).toBe("private-key");
				return Response.json({
					id: assetId,
					ownerId: immichUser,
					type: "IMAGE",
					originalFileName: "a.jpg",
					width: 1,
					height: 2,
					thumbhash: null,
					fileCreatedAt: "2024-01-01T00:00:00Z",
				});
			},
		);
		vi.stubGlobal("fetch", fetcher);
		expect(
			(
				await PUT(
					apiRequest("/api/immich", {
						method: "PUT",
						body: { apiKey: "private-key" },
					}),
					{},
				)
			).status,
		).toBe(200);
		expect(
			(await db().immichConnection.findFirstOrThrow()).apiKey,
		).not.toContain("private-key");
		const ownerId = await userId();
		const outfit = await db().outfit.create({
			data: { ownerId, name: "Look" },
		});
		const request = () =>
			apiRequest(`/api/outfits/${outfit.id}/immich-assets`, {
				method: "POST",
				body: { assetIds: [assetId] },
			});
		const one = await json<{ id: string }[]>(
			await link(request(), routeParams({ id: outfit.id })),
		);
		const two = await json<{ id: string }[]>(
			await link(request(), routeParams({ id: outfit.id })),
		);
		expect(one[0]?.id).toBe(two[0]?.id);
		await db().outfitShare.create({
			data: { outfitId: outfit.id, granteeId: await userId(OTHER_USER) },
		});
		const response = await variant(
			apiRequest("/", { user: OTHER_USER }),
			routeParams({
				id: outfit.id,
				linkId: one[0]?.id ?? "",
				variant: "display",
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("image");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(response.headers.get("cache-control")).toBe("private, max-age=300");
		await DELETE(apiRequest("/api/immich", { method: "DELETE" }), {});
		expect(
			(
				await variant(
					apiRequest("/", { user: OTHER_USER }),
					routeParams({
						id: outfit.id,
						linkId: one[0]?.id ?? "",
						variant: "thumb",
					}),
				)
			).status,
		).toBe(404);
	});
	it("maps revoked stored keys to unavailable and hides shared library assets", async () => {
		const f = vi.fn(async (url: string | URL | Request) => {
			if (String(url).endsWith("/users/me"))
				return Response.json({
					id: immichUser,
					email: "a@example.com",
					name: "A",
				});
			return new Response(null, { status: 403 });
		});
		vi.stubGlobal("fetch", f);
		await PUT(
			apiRequest("/api/immich", { method: "PUT", body: { apiKey: "key" } }),
			{},
		);
		const response = await thumb(apiRequest("/"), routeParams({ assetId }));
		expect(response.status).toBe(502);
		expect((await json<{ error: string }>(response)).error).toBe(
			"immich_unavailable",
		);
		const shared = vi.fn(async () =>
			Response.json({ id: assetId, ownerId: "another-user", type: "IMAGE" }),
		);
		vi.stubGlobal("fetch", shared);
		expect(
			(await thumb(apiRequest("/"), routeParams({ assetId }))).status,
		).toBe(404);
		expect(shared).toHaveBeenCalledTimes(1);
	});
	it("rejects keys and validates picker ids before calling Immich", async () => {
		const f = vi.fn(async () => new Response(null, { status: 401 }));
		vi.stubGlobal("fetch", f);
		const response = await PUT(
			apiRequest("/api/immich", { method: "PUT", body: { apiKey: "bad" } }),
			{},
		);
		expect(response.status).toBe(422);
		expect((await json<{ error: string }>(response)).error).toBe(
			"immich_key_rejected",
		);
		f.mockClear();
		expect(
			(await thumb(apiRequest("/"), routeParams({ assetId: "../bad" }))).status,
		).toBe(400);
		expect(f).not.toHaveBeenCalled();
	});
});
