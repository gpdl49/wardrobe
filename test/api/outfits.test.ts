import { beforeEach, expect, it, vi } from "vitest";
import {
	GET as get,
	PATCH as patch,
	DELETE as remove,
} from "@/app/api/outfits/[id]/route";
import { POST as shareRoute } from "@/app/api/outfits/[id]/shares/route";
import { POST as create, GET as list } from "@/app/api/outfits/route";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { makeOutfit, shareOutfit } from "@/test/helpers/outfits";
import { installFakeS3 } from "@/test/helpers/s3";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

describeWithDb("outfits API", () => {
	beforeEach(async () => {
		await resetDb();
	});
	it("enforces ownership of items and access to writes", async () => {
		const foreign = await makeItem({ ownerId: await userId(OTHER_USER) });
		const response = await create(
			apiRequest("/api/outfits", {
				method: "POST",
				body: { name: "x", itemIds: [foreign.id] },
			}),
			{},
		);
		expect(response.status).toBe(422);
		const outfit = await makeOutfit();
		await shareOutfit(outfit.id, await userId(OTHER_USER));
		expect(
			(
				await patch(
					apiRequest("/", {
						method: "PATCH",
						user: OTHER_USER,
						body: { name: "x" },
					}),
					routeParams({ id: outfit.id }),
				)
			).status,
		).toBe(403);
		expect(
			(
				await get(
					apiRequest("/", { user: THIRD_USER }),
					routeParams({ id: outfit.id }),
				)
			).status,
		).toBe(404);
	});
	it("limits direct shares, redacts item location, and excludes location shares", async () => {
		const location = await makeLocation();
		const item = await makeItem({ locationId: location.id });
		const outfit = await makeOutfit();
		await makeOutfit({ name: "private" });
		await db().outfitItem.create({
			data: { outfitId: outfit.id, itemId: item.id, position: 0 },
		});
		await shareOutfit(outfit.id, await userId(OTHER_USER));
		await share(TEST_USER, THIRD_USER, "view", location.id);
		const detail = await json<{
			items: { access: string; location: unknown }[];
		}>(
			await get(
				apiRequest("/", { user: OTHER_USER }),
				routeParams({ id: outfit.id }),
			),
		);
		expect(detail.items[0]).toMatchObject({ access: "view", location: null });
		const result = await json<{ outfits: { id: string }[] }>(
			await list(
				apiRequest(`/api/outfits?owner=${await userId()}`, {
					user: OTHER_USER,
				}),
				{},
			),
		);
		expect(result.outfits.map((o) => o.id)).toEqual([outfit.id]);
		expect(
			(
				await get(
					apiRequest("/", { user: THIRD_USER }),
					routeParams({ id: outfit.id }),
				)
			).status,
		).toBe(404);
		const empty = await json<{ outfits: unknown[] }>(
			await list(apiRequest("/api/outfits?season=unknown&item=unknown"), {}),
		);
		expect(empty.outfits).toEqual([]);
	});
	it("hides shares from editors and prevents them managing shares", async () => {
		const outfit = await makeOutfit();
		await share(TEST_USER, OTHER_USER, "edit");
		await userId(THIRD_USER);
		await shareOutfit(outfit.id, await userId(THIRD_USER));
		const detail = await json<{ shares: unknown[] }>(
			await get(
				apiRequest("/", { user: OTHER_USER }),
				routeParams({ id: outfit.id }),
			),
		);
		expect(detail.shares).toEqual([]);
		expect(
			(
				await shareRoute(
					apiRequest("/", {
						method: "POST",
						user: OTHER_USER,
						body: { grantee: "third" },
					}),
					routeParams({ id: outfit.id }),
				)
			).status,
		).toBe(403);
	});
	it("saves suggestions once, using the submitted outfit", async () => {
		const ownerId = await userId();
		const run = await db().suggestionRun.create({
			data: { ownerId, requestedById: ownerId, request: {}, status: "done" },
		});
		const suggestion = await db().outfitSuggestion.create({
			data: {
				runId: run.id,
				ownerId,
				position: 0,
				name: "Proposed",
				itemIds: [],
			},
		});
		const request = () =>
			apiRequest("/api/outfits", {
				method: "POST",
				body: { name: "Chosen", suggestionId: suggestion.id },
			});
		const response = await create(request(), {});
		expect(response.status).toBe(201);
		const outfit = await json<{ id: string; name: string }>(response);
		expect(outfit.name).toBe("Chosen");
		expect(
			await db().outfitSuggestion.findUnique({ where: { id: suggestion.id } }),
		).toMatchObject({ feedback: "saved", outfitId: outfit.id });
		expect((await create(request(), {})).status).toBe(409);
	});
	it("replays an idempotent create and presents linked photos", async () => {
		const request = () =>
			apiRequest("/api/outfits", {
				method: "POST",
				headers: { "Idempotency-Key": "outfit-test" },
				body: { name: "Look" },
			});
		const first = await json<{ id: string }>(await create(request(), {}));
		const second = await json<{ id: string }>(await create(request(), {}));
		expect(second.id).toBe(first.id);
		await db().outfitImmichAsset.create({
			data: {
				outfitId: first.id,
				linkedById: await userId(),
				assetId: "0190f5a0-0000-7000-8000-000000000001",
			},
		});
		const detail = await json<{
			photos: { id: string; source: string; urls: { thumb: string } }[];
			cover: { source: string };
		}>(await get(apiRequest("/"), routeParams({ id: first.id })));
		expect(detail.cover.source).toBe("immich");
		expect(detail.photos[0]?.urls.thumb).toContain(
			`/api/outfits/${first.id}/immich-assets/`,
		);
	});
	it("does not replay a created outfit after wardrobe access is revoked", async () => {
		const ownerId = await userId();
		const grant = await share(TEST_USER, OTHER_USER, "edit");
		const request = () =>
			apiRequest("/api/outfits", {
				method: "POST",
				user: OTHER_USER,
				headers: { "Idempotency-Key": "revoked-outfit" },
				body: { name: "Private", ownerId },
			});
		expect((await create(request(), {})).status).toBe(201);
		await db().share.delete({ where: { id: grant.id } });
		expect((await create(request(), {})).status).toBe(404);
	});
	it("keeps the outfit and photos when object deletion fails so deletion can be retried", async () => {
		const outfit = await makeOutfit();
		const photo = await db().photo.create({
			data: {
				ownerId: outfit.ownerId,
				outfitId: outfit.id,
				kind: "outfit",
				status: "ready",
				contentType: "image/jpeg",
				size: 1,
			},
		});
		const s3 = installFakeS3();
		vi.spyOn(s3.client, "send").mockRejectedValueOnce(
			new Error("storage unavailable") as never,
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(
				(
					await remove(
						apiRequest("/", { method: "DELETE" }),
						routeParams({ id: outfit.id }),
					)
				).status,
			).toBe(500);
			expect(
				await db().photo.findUnique({ where: { id: photo.id } }),
			).not.toBeNull();
			expect(
				await db().outfit.findUnique({ where: { id: outfit.id } }),
			).not.toBeNull();
		} finally {
			s3.restore();
			vi.restoreAllMocks();
		}
	});
	it("deletes uploaded photo objects and Immich links with the outfit", async () => {
		const outfit = await makeOutfit();
		const photo = await db().photo.create({
			data: {
				ownerId: outfit.ownerId,
				outfitId: outfit.id,
				kind: "outfit",
				status: "ready",
				contentType: "image/jpeg",
				size: 1,
			},
		});
		await db().outfitImmichAsset.create({
			data: {
				outfitId: outfit.id,
				linkedById: outfit.ownerId,
				assetId: crypto.randomUUID(),
			},
		});
		const s3 = installFakeS3();
		try {
			for (const key of [
				`photos/${photo.id}/original`,
				`photos/${photo.id}/thumb.webp`,
				`photos/${photo.id}/display.webp`,
			])
				s3.upload(key, new Uint8Array([1]));
			expect(
				(
					await remove(
						apiRequest("/", { method: "DELETE" }),
						routeParams({ id: outfit.id }),
					)
				).status,
			).toBe(204);
			expect(s3.objects.size).toBe(0);
			expect(await db().photo.count()).toBe(0);
			expect(await db().outfitImmichAsset.count()).toBe(0);
		} finally {
			s3.restore();
		}
	});
	it("validates outfit items and replaces their order", async () => {
		const items = await Promise.all([makeItem(), makeItem()]);
		const ids = items.map((item) => item.id);
		const request = (body: unknown) =>
			apiRequest("/api/outfits", { method: "POST", body });
		expect(
			(await create(request({ name: "x", itemIds: [ids[0], ids[0]] }), {}))
				.status,
		).toBe(400);
		expect(
			(
				await create(
					request({
						name: "x",
						itemIds: Array.from({ length: 51 }, () => crypto.randomUUID()),
					}),
					{},
				)
			).status,
		).toBe(400);
		const result = await json<{ id: string }>(
			await create(request({ name: "x", itemIds: ids }), {}),
		);
		const updated = await json<{ items: { id: string }[] }>(
			await patch(
				apiRequest("/", {
					method: "PATCH",
					body: { itemIds: ids.toReversed() },
				}),
				routeParams({ id: result.id }),
			),
		);
		expect(updated.items.map((item) => item.id)).toEqual(ids.toReversed());
	});
	it("validates share recipients and duplicate shares", async () => {
		const outfit = await makeOutfit();
		await userId(OTHER_USER);
		const post = (grantee: string) =>
			shareRoute(
				apiRequest("/", { method: "POST", body: { grantee } }),
				routeParams({ id: outfit.id }),
			);
		expect((await post("not-a-user")).status).toBe(422);
		expect((await post(TEST_USER.email as string)).status).toBe(422);
		expect((await post(OTHER_USER.username as string)).status).toBe(201);
		expect((await post(OTHER_USER.email as string)).status).toBe(409);
	});
	it("filters, paginates and chooses the first ready upload as cover", async () => {
		const item = await makeItem();
		const request = (body: unknown) =>
			apiRequest("/api/outfits", { method: "POST", body });
		const old = await json<{ id: string }>(
			await create(
				request({
					name: "Summer look",
					seasons: ["summer"],
					tags: ["formal"],
					itemIds: [item.id],
				}),
				{},
			),
		);
		const newer = await json<{ id: string }>(
			await create(request({ name: "Winter look", seasons: ["winter"] }), {}),
		);
		await db().outfit.update({
			where: { id: old.id },
			data: { createdAt: new Date("2020-01-01T00:00:00Z") },
		});
		const photo = await db().photo.create({
			data: {
				ownerId: await userId(),
				outfitId: old.id,
				kind: "outfit",
				status: "ready",
				contentType: "image/jpeg",
				size: 1,
			},
		});
		await db().outfitImmichAsset.create({
			data: {
				outfitId: old.id,
				linkedById: await userId(),
				assetId: crypto.randomUUID(),
			},
		});
		const filtered = await json<{
			outfits: { id: string; cover: { id: string }; previewItems: unknown[] }[];
		}>(
			await list(
				apiRequest(
					`/api/outfits?q=Summer&tag=formal&season=summer&item=${item.id}`,
				),
				{},
			),
		);
		expect(filtered.outfits).toHaveLength(1);
		expect(filtered.outfits[0]).toMatchObject({
			id: old.id,
			cover: { id: photo.id },
			previewItems: [{ id: item.id }],
		});
		const page = await json<{ outfits: { id: string }[]; nextCursor: string }>(
			await list(apiRequest("/api/outfits?limit=1"), {}),
		);
		expect(page.outfits[0]?.id).toBe(newer.id);
		const next = await json<{ outfits: { id: string }[] }>(
			await list(
				apiRequest(
					`/api/outfits?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`,
				),
				{},
			),
		);
		expect(next.outfits[0]?.id).toBe(old.id);
	});
});
