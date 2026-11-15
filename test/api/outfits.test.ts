import { beforeEach, expect, it } from "vitest";
import { GET as get, PATCH as patch } from "@/app/api/outfits/[id]/route";
import { POST as shareRoute } from "@/app/api/outfits/[id]/shares/route";
import { POST as create, GET as list } from "@/app/api/outfits/route";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { makeOutfit, shareOutfit } from "@/test/helpers/outfits";
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
});
