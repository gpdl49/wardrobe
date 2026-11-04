import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DELETE as deleteItem,
	GET as getItem,
	PATCH as patchItem,
} from "@/app/api/items/[id]/route";
import { POST as moveItems } from "@/app/api/items/move/route";
import { GET as listItems, POST as postItem } from "@/app/api/items/route";
import { GET as getLocation } from "@/app/api/locations/[id]/route";
import type {
	ItemDetailDto,
	ItemListDto,
	ItemSummaryDto,
	LocationDetailDto,
} from "@/lib/api/types";
import { db } from "@/lib/db";
import { deleteObjects } from "@/lib/s3";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

vi.mock("@/lib/s3", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/s3")>()),
	deleteObjects: vi.fn(async () => {}),
}));

const MISSING = "0190f5a0-0000-7000-8000-000000000000";

const create = (body: unknown) =>
	postItem(apiRequest("/api/items", { method: "POST", body }), {});
const patch = (id: string, body: unknown) =>
	patchItem(
		apiRequest(`/api/items/${id}`, { method: "PATCH", body }),
		routeParams({ id }),
	);
const get = (id: string) =>
	getItem(apiRequest(`/api/items/${id}`), routeParams({ id }));
const remove = (id: string) =>
	deleteItem(
		apiRequest(`/api/items/${id}`, { method: "DELETE" }),
		routeParams({ id }),
	);
const list = async (query = "") => {
	const response = await listItems(apiRequest(`/api/items${query}`), {});
	expect(response.status).toBe(200);
	return json<ItemListDto>(response);
};
const ids = (page: ItemListDto) => page.items.map((i) => i.id);
const move = (body: unknown) =>
	moveItems(apiRequest("/api/items/move", { method: "POST", body }), {});

const makePhoto = async (itemId: string | null) =>
	db().photo.create({
		data: {
			ownerId: await userId(),
			itemId,
			kind: "main",
			contentType: "image/jpeg",
			size: 1234,
		},
	});

const makeCategory = (name: string, parentId: string | null = null) =>
	db().category.create({
		data: { name, slug: name.toLowerCase(), parentId },
	});

describeWithDb("items API", () => {
	beforeEach(async () => {
		await resetDb();
		vi.mocked(deleteObjects).mockClear();
	});

	describe("POST /api/items", () => {
		it("creates a nameless item with defaults", async () => {
			const response = await create({});
			expect(response.status).toBe(201);
			const item = await json<ItemSummaryDto>(response);
			expect(item).toEqual({
				id: expect.any(String),
				ownerId: await userId(),
				access: "owner",
				name: null,
				category: null,
				brand: null,
				size: null,
				colors: [],
				pattern: null,
				material: null,
				seasons: [],
				status: "active",
				location: null,
				notes: null,
				tags: [],
				coverPhoto: null,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			});
			expect(await db().movement.count()).toBe(0);
		});

		it("creates a full item, places it and applies the status rule", async () => {
			const bag = await makeLocation({ kind: "bag", code: "B-07" });
			const knit = await makeCategory("Knitwear");
			const item = await json<ItemSummaryDto>(
				await create({
					name: "Grey cardigan",
					categoryId: knit.id,
					brand: "Uniqlo",
					size: "M",
					colors: [{ name: "grey", hex: "#808080", share: 0.9 }],
					pattern: "solid",
					material: "Merino wool",
					seasons: ["winter", "autumn"],
					locationId: bag.id,
					notes: "Darned elbow",
					tags: ["Work", "warm"],
				}),
			);
			expect(item).toMatchObject({
				name: "Grey cardigan",
				category: { id: knit.id, name: "Knitwear", slug: "knitwear" },
				location: { id: bag.id, kind: "bag", code: "B-07", name: bag.name },
				seasons: ["autumn", "winter"],
				status: "stored",
				tags: ["warm", "work"],
			});
			const movements = await db().movement.findMany();
			expect(movements).toMatchObject([
				{ itemId: item.id, fromLocationId: null, toLocationId: bag.id },
			]);
		});

		it("keeps an explicit status", async () => {
			const bag = await makeLocation({ kind: "bag" });
			const item = await json<ItemSummaryDto>(
				await create({ locationId: bag.id, status: "lent" }),
			);
			expect(item.status).toBe("lent");
		});

		it("422s on unknown references, 400 on bad input", async () => {
			expect((await create({ categoryId: MISSING })).status).toBe(422);
			expect((await create({ locationId: MISSING })).status).toBe(422);
			expect((await create({ sessionId: MISSING })).status).toBe(422);
			expect((await create({ colour: "red" })).status).toBe(400);
			expect((await create({ seasons: ["monsoon"] })).status).toBe(400);
			expect(await db().item.count()).toBe(0);
		});

		it("401s without auth", async () => {
			const response = await postItem(
				apiRequest("/api/items", { method: "POST", body: {}, user: null }),
				{},
			);
			expect(response.status).toBe(401);
		});
	});

	describe("GET /api/items", () => {
		it("filters by location id or code", async () => {
			const bag = await makeLocation({ code: "B-07" });
			const inBag = await makeItem({ locationId: bag.id });
			await makeItem();
			expect(ids(await list(`?location=${bag.id}`))).toEqual([inBag.id]);
			expect(ids(await list("?location=b-07"))).toEqual([inBag.id]);
			expect(ids(await list("?location=NOPE"))).toEqual([]);
			expect(ids(await list("?location=%20bad%20code%20"))).toEqual([]);
		});

		it("filters by category id or slug, including subcategories", async () => {
			const tops = await makeCategory("Tops");
			const knit = await makeCategory("Knitwear", tops.id);
			const shoes = await makeCategory("Shoes");
			const top = await makeItem({ categoryId: tops.id });
			const jumper = await makeItem({ categoryId: knit.id });
			await makeItem({ categoryId: shoes.id });
			expect(new Set(ids(await list("?category=tops")))).toEqual(
				new Set([top.id, jumper.id]),
			);
			expect(ids(await list(`?category=${knit.id}`))).toEqual([jumper.id]);
			expect(ids(await list("?category=missing"))).toEqual([]);
		});

		it("filters by tag, season, status and colour", async () => {
			const a = await json<ItemSummaryDto>(
				await create({
					tags: ["work"],
					seasons: ["winter"],
					colors: [
						{ name: "navy", hex: "#1f2a44", share: 0.7 },
						{ name: "white", hex: "#ffffff", share: 0.3 },
					],
				}),
			);
			const b = await json<ItemSummaryDto>(
				await create({
					tags: ["gym"],
					seasons: ["summer", "spring"],
					status: "lent",
					colors: [{ name: "white", hex: "#ffffff", share: 1 }],
				}),
			);
			expect(ids(await list("?tag=WORK"))).toEqual([a.id]);
			expect(ids(await list("?season=spring"))).toEqual([b.id]);
			expect(ids(await list("?status=lent"))).toEqual([b.id]);
			expect(ids(await list("?color=Navy"))).toEqual([a.id]);
			expect(new Set(ids(await list("?color=white")))).toEqual(
				new Set([a.id, b.id]),
			);
			expect(ids(await list("?color=red"))).toEqual([]);
			expect(ids(await list("?tag=work&season=summer"))).toEqual([]);
		});

		it("searches name, brand, notes, material and tags case-insensitively", async () => {
			const byName = await makeItem({ name: "Blue Oxford shirt" });
			const byBrand = await makeItem({ name: null, brand: "OXFORD Mills" });
			const byNotes = await makeItem({ name: null, notes: "from oxford" });
			const byMaterial = await makeItem({
				name: null,
				material: "Oxford cloth",
			});
			const byTag = await json<ItemSummaryDto>(
				await create({ tags: ["oxfordish"] }),
			);
			await makeItem({ name: "Linen trousers" });
			expect(new Set(ids(await list("?q=oxford")))).toEqual(
				new Set([byName.id, byBrand.id, byNotes.id, byMaterial.id, byTag.id]),
			);
		});

		it("pages by (createdAt desc, id desc) with a cursor", async () => {
			const at = new Date("2026-11-01T10:00:00.000Z");
			// Two items share a timestamp: the id breaks the tie.
			const made = [
				await makeItem({ createdAt: new Date(at.getTime() - 2000) }),
				await makeItem({ createdAt: at }),
				await makeItem({ createdAt: at }),
				await makeItem({ createdAt: new Date(at.getTime() + 1000) }),
				await makeItem({ createdAt: new Date(at.getTime() + 2000) }),
			];
			const expected = [...made]
				.sort(
					(x, y) =>
						y.createdAt.getTime() - x.createdAt.getTime() ||
						(y.id < x.id ? -1 : 1),
				)
				.map((i) => i.id);

			const seen: string[] = [];
			let cursor: string | null = null;
			let pages = 0;
			do {
				const page: ItemListDto = await list(
					`?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
				);
				seen.push(...ids(page));
				cursor = page.nextCursor;
				pages++;
			} while (cursor && pages < 10);
			expect(seen).toEqual(expected);
			expect(pages).toBe(3);

			const all = await list("?limit=5");
			expect(all.nextCursor).toBeNull();
		});

		it("400s on a bad cursor or limit", async () => {
			for (const query of ["?cursor=garbage", "?limit=0", "?limit=101"]) {
				const response = await listItems(apiRequest(`/api/items${query}`), {});
				expect(response.status).toBe(400);
			}
		});
	});

	describe("GET /api/items/{id}", () => {
		it("returns photos, movements newest first and analyses", async () => {
			const closet = await makeLocation({ kind: "closet", code: "CL-1" });
			const bag = await makeLocation({ kind: "bag", code: "B-1" });
			const item = await json<ItemSummaryDto>(
				await create({ locationId: closet.id }),
			);
			// Backdate the first movement so the order does not hinge on two
			// writes landing in different milliseconds.
			await db().movement.updateMany({
				data: { at: new Date(Date.now() - 60_000) },
			});
			await patch(item.id, { locationId: bag.id });
			const photo = await makePhoto(item.id);
			const analysis = await db().analysis.create({
				data: {
					itemId: item.id,
					photoId: photo.id,
					kind: "colors",
					status: "done",
					result: { colors: [] },
				},
			});

			const response = await get(item.id);
			expect(response.status).toBe(200);
			const detail = await json<ItemDetailDto>(response);
			expect(detail.photos.map((p) => p.id)).toEqual([photo.id]);
			expect(detail.photos[0]?.urls.thumb).toBe(
				`/api/photos/${photo.id}/thumb`,
			);
			expect(
				detail.movements.map((m) => [m.from?.code ?? null, m.to?.code]),
			).toEqual([
				["CL-1", "B-1"],
				[null, "CL-1"],
			]);
			expect(detail.movements[0]?.to).toEqual({
				id: bag.id,
				kind: "bag",
				code: "B-1",
				name: bag.name,
			});
			expect(detail.analyses).toMatchObject([
				{ id: analysis.id, kind: "colors", result: { colors: [] } },
			]);
		});

		it("404s on unknown and non-UUID ids", async () => {
			for (const id of [MISSING, "nope"]) {
				expect((await get(id)).status).toBe(404);
			}
		});
	});

	describe("PATCH /api/items/{id}", () => {
		it("updates fields and replaces tags", async () => {
			const item = await json<ItemSummaryDto>(
				await create({ name: "Shirt", tags: ["a", "b"] }),
			);
			const response = await patch(item.id, {
				name: "Oxford shirt",
				brand: null,
				tags: ["B", "c"],
			});
			expect(response.status).toBe(200);
			expect(await json(response)).toMatchObject({
				name: "Oxford shirt",
				brand: null,
				tags: ["b", "c"],
			});
			const untouched = await json<ItemSummaryDto>(
				await patch(item.id, { size: "L" }),
			);
			expect(untouched.tags).toEqual(["b", "c"]);
			const cleared = await json<ItemSummaryDto>(
				await patch(item.id, { tags: [] }),
			);
			expect(cleared.tags).toEqual([]);
		});

		it("writes a Movement and applies the status rule on a location change", async () => {
			const bag = await makeLocation({ kind: "bag" });
			const drawer = await makeLocation({ kind: "drawer" });
			const other = await makeLocation({ kind: "other" });
			const item = await makeItem({ status: "donated" });

			const packed = await json<ItemSummaryDto>(
				await patch(item.id, { locationId: bag.id }),
			);
			expect(packed.status).toBe("stored");
			expect(packed.location?.id).toBe(bag.id);

			// Same location again: no Movement.
			await patch(item.id, { locationId: bag.id, name: "x" });
			expect(await db().movement.count()).toBe(1);

			const unpacked = await json<ItemSummaryDto>(
				await patch(item.id, { locationId: drawer.id }),
			);
			expect(unpacked.status).toBe("active");

			const lent = await json<ItemSummaryDto>(
				await patch(item.id, { locationId: other.id, status: "lent" }),
			);
			expect(lent.status).toBe("lent");

			const nowhere = await json<ItemSummaryDto>(
				await patch(item.id, { locationId: null }),
			);
			expect(nowhere.status).toBe("lent");
			expect(nowhere.location).toBeNull();

			// Compared as a set: consecutive writes may share a millisecond.
			const movements = await db().movement.findMany();
			expect(
				movements.map((m) => `${m.fromLocationId}>${m.toLocationId}`).sort(),
			).toEqual(
				[
					`null>${bag.id}`,
					`${bag.id}>${drawer.id}`,
					`${drawer.id}>${other.id}`,
					`${other.id}>null`,
				].sort(),
			);
		});

		it("sets the cover photo only to one of the item's photos", async () => {
			const item = await makeItem();
			const own = await makePhoto(item.id);
			const foreign = await makePhoto((await makeItem()).id);
			const loose = await makePhoto(null);

			const ok = await json<ItemSummaryDto>(
				await patch(item.id, { coverPhotoId: own.id }),
			);
			expect(ok.coverPhoto?.id).toBe(own.id);
			for (const coverPhotoId of [foreign.id, loose.id, MISSING]) {
				expect((await patch(item.id, { coverPhotoId })).status).toBe(422);
			}
			const cleared = await json<ItemSummaryDto>(
				await patch(item.id, { coverPhotoId: null }),
			);
			expect(cleared.coverPhoto).toBeNull();
		});

		it("404s on unknown items, 422 on unknown references", async () => {
			expect((await patch(MISSING, { name: "x" })).status).toBe(404);
			expect((await patch("nope", { name: "x" })).status).toBe(404);
			const item = await makeItem();
			expect((await patch(item.id, { locationId: MISSING })).status).toBe(422);
			expect((await patch(item.id, { categoryId: MISSING })).status).toBe(422);
			expect(await db().movement.count()).toBe(0);
		});
	});

	describe("DELETE /api/items/{id}", () => {
		it("deletes the item, its photos and their objects", async () => {
			const item = await makeItem();
			const photo = await makePhoto(item.id);
			await db().item.update({
				where: { id: item.id },
				data: { coverPhotoId: photo.id },
			});
			const response = await remove(item.id);
			expect(response.status).toBe(204);
			expect(await db().item.count()).toBe(0);
			expect(await db().photo.count()).toBe(0);
			expect(deleteObjects).toHaveBeenCalledWith([
				`photos/${photo.id}/original`,
				`photos/${photo.id}/display.webp`,
				`photos/${photo.id}/thumb.webp`,
			]);
		});

		it("skips S3 without photos and survives an S3 failure", async () => {
			const bare = await makeItem();
			expect((await remove(bare.id)).status).toBe(204);
			expect(deleteObjects).not.toHaveBeenCalled();

			const item = await makeItem();
			await makePhoto(item.id);
			vi.mocked(deleteObjects).mockRejectedValueOnce(new Error("S3 down"));
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			expect((await remove(item.id)).status).toBe(204);
			expect(spy).toHaveBeenCalled();
			spy.mockRestore();
			expect(await db().item.count()).toBe(0);
		});

		it("404s on unknown ids", async () => {
			expect((await remove(MISSING)).status).toBe(404);
			expect((await remove("nope")).status).toBe(404);
		});
	});

	describe("POST /api/items/move", () => {
		it("moves items, skipping those already there, and applies the status rule", async () => {
			const suitcase = await makeLocation({ kind: "suitcase" });
			const closet = await makeLocation({ kind: "closet" });
			const a = await makeItem({ locationId: closet.id });
			const b = await makeItem();
			const c = await makeItem({ locationId: suitcase.id, status: "stored" });

			const response = await move({
				itemIds: [a.id, b.id, c.id, a.id],
				toLocationId: suitcase.id,
			});
			expect(response.status).toBe(200);
			expect(await json(response)).toEqual({ moved: 2 });
			const rows = await db().item.findMany({ orderBy: { id: "asc" } });
			expect(rows.every((r) => r.locationId === suitcase.id)).toBe(true);
			expect(rows.every((r) => r.status === "stored")).toBe(true);
			const movements = await db().movement.findMany();
			expect(
				movements
					.map((m) => [m.itemId, m.fromLocationId, m.toLocationId])
					.sort(),
			).toEqual(
				[
					[a.id, closet.id, suitcase.id],
					[b.id, null, suitcase.id],
				].sort(),
			);

			expect(
				await json(
					await move({ itemIds: [a.id, b.id], toLocationId: closet.id }),
				),
			).toEqual({ moved: 2 });
			expect(
				(await db().item.findUniqueOrThrow({ where: { id: a.id } })).status,
			).toBe("active");
		});

		it("moves out of any location without changing status", async () => {
			const bag = await makeLocation({ kind: "bag" });
			const item = await makeItem({ locationId: bag.id, status: "stored" });
			expect(
				await json(await move({ itemIds: [item.id], toLocationId: null })),
			).toEqual({ moved: 1 });
			const row = await db().item.findUniqueOrThrow({ where: { id: item.id } });
			expect(row).toMatchObject({ locationId: null, status: "stored" });
		});

		it("is all or nothing: 422 on an unknown item or location", async () => {
			const bag = await makeLocation({ kind: "bag" });
			const item = await makeItem();
			const unknownItem = await move({
				itemIds: [item.id, MISSING],
				toLocationId: bag.id,
			});
			expect(unknownItem.status).toBe(422);
			expect((await json<{ message: string }>(unknownItem)).message).toContain(
				MISSING,
			);
			expect(
				(await move({ itemIds: [item.id], toLocationId: MISSING })).status,
			).toBe(422);
			expect(await db().movement.count()).toBe(0);
			expect(
				(await db().item.findUniqueOrThrow({ where: { id: item.id } }))
					.locationId,
			).toBeNull();
		});

		it("400s on bad input", async () => {
			expect((await move({ itemIds: [], toLocationId: null })).status).toBe(
				400,
			);
			expect((await move({ itemIds: ["x"], toLocationId: null })).status).toBe(
				400,
			);
			expect((await move({ itemIds: [MISSING] })).status).toBe(400);
		});
	});

	describe("GET /api/locations/{id}", () => {
		it("lists its items as ItemSummaryDto and children with counts", async () => {
			const closet = await makeLocation({ kind: "closet", code: "CL-LOFT" });
			const bag = await makeLocation({ code: "B-07", parentId: closet.id });
			const item = await json<ItemSummaryDto>(
				await create({ name: "Coat", locationId: closet.id, tags: ["warm"] }),
			);
			await makeItem({ locationId: bag.id });
			const detail = await json<LocationDetailDto>(
				await getLocation(
					apiRequest(`/api/locations/${closet.id}`),
					routeParams({ id: closet.id }),
				),
			);
			expect(detail.items).toEqual([item]);
			expect(detail.children).toMatchObject([{ id: bag.id, itemCount: 1 }]);
		});
	});

	describe("sharing", () => {
		type Actor = typeof OTHER_USER;
		const as = (user: Actor) => ({
			create: (body: unknown) =>
				postItem(apiRequest("/api/items", { method: "POST", body, user }), {}),
			get: (id: string) =>
				getItem(apiRequest(`/api/items/${id}`, { user }), routeParams({ id })),
			patch: (id: string, body: unknown) =>
				patchItem(
					apiRequest(`/api/items/${id}`, { method: "PATCH", body, user }),
					routeParams({ id }),
				),
			remove: (id: string) =>
				deleteItem(
					apiRequest(`/api/items/${id}`, { method: "DELETE", user }),
					routeParams({ id }),
				),
			move: (body: unknown) =>
				moveItems(
					apiRequest("/api/items/move", { method: "POST", body, user }),
					{},
				),
			list: async (query = "") =>
				json<ItemListDto>(
					await listItems(apiRequest(`/api/items${query}`, { user }), {}),
				),
		});
		const other = as(OTHER_USER);

		/** TEST_USER's closet with a nested bag, an item in each, one loose. */
		async function wardrobe() {
			const closet = await makeLocation({ kind: "closet", code: "CL-1" });
			const bag = await makeLocation({
				kind: "bag",
				code: "B-1",
				parentId: closet.id,
			});
			const elsewhere = await makeLocation({ kind: "drawer", code: "D-1" });
			return {
				closet,
				bag,
				elsewhere,
				inCloset: await makeItem({ locationId: closet.id }),
				inBag: await makeItem({ locationId: bag.id }),
				inDrawer: await makeItem({ locationId: elsewhere.id }),
				loose: await makeItem(),
			};
		}

		it("hides another user's items entirely", async () => {
			const { inCloset, loose, closet } = await wardrobe();
			expect((await other.get(inCloset.id)).status).toBe(404);
			expect((await other.patch(inCloset.id, { name: "x" })).status).toBe(404);
			expect((await other.remove(loose.id)).status).toBe(404);
			expect(ids(await other.list())).toEqual([]);
			expect(
				ids(await other.list(`?owner=${await userId(TEST_USER)}`)),
			).toEqual([]);
			expect((await other.create({ locationId: closet.id })).status).toBe(422);
			const unknown = await other.move({
				itemIds: [inCloset.id],
				toLocationId: null,
			});
			expect(unknown.status).toBe(422);
			expect((await json<{ message: string }>(unknown)).message).toContain(
				inCloset.id,
			);
		});

		it("lists your own wardrobe by default, a shared one with owner=", async () => {
			const { inCloset, inBag, inDrawer, loose } = await wardrobe();
			const mine = await makeItem({ ownerId: await userId(OTHER_USER) });
			await share(TEST_USER, OTHER_USER, "view");
			const owner = await userId(TEST_USER);
			expect(ids(await other.list())).toEqual([mine.id]);
			const shared = await other.list(`?owner=${owner}`);
			expect(new Set(ids(shared))).toEqual(
				new Set([inCloset.id, inBag.id, inDrawer.id, loose.id]),
			);
			expect(shared.items.every((i) => i.access === "view")).toBe(true);
			expect(shared.items.every((i) => i.ownerId === owner)).toBe(true);
		});

		it("resolves a location code inside the listed owner's wardrobe", async () => {
			const mine = await makeLocation({ code: "B-07" });
			const theirs = await makeLocation({
				code: "B-07",
				ownerId: await userId(OTHER_USER),
			});
			const myItem = await makeItem({ locationId: mine.id });
			const theirItem = await makeItem({
				ownerId: theirs.ownerId,
				locationId: theirs.id,
			});
			await share(TEST_USER, OTHER_USER, "view");
			expect(ids(await list("?location=B-07"))).toEqual([myItem.id]);
			expect(ids(await other.list("?location=B-07"))).toEqual([theirItem.id]);
			expect(
				ids(await other.list(`?location=B-07&owner=${mine.ownerId}`)),
			).toEqual([myItem.id]);
		});

		it("covers a shared location and what is nested in it, nothing else", async () => {
			const { closet, inCloset, inBag, inDrawer, loose } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "view", closet.id);
			const listed = await other.list(`?owner=${closet.ownerId}`);
			expect(new Set(ids(listed))).toEqual(new Set([inCloset.id, inBag.id]));
			expect((await other.get(inBag.id)).status).toBe(200);
			expect((await other.get(inDrawer.id)).status).toBe(404);
			expect((await other.get(loose.id)).status).toBe(404);
		});

		it("403s writes with view access", async () => {
			const { closet, bag, inCloset } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "view");
			expect((await other.patch(inCloset.id, { name: "x" })).status).toBe(403);
			expect((await other.remove(inCloset.id)).status).toBe(403);
			expect((await other.create({ locationId: closet.id })).status).toBe(403);
			expect((await other.create({ ownerId: closet.ownerId })).status).toBe(
				403,
			);
			expect(
				(await other.move({ itemIds: [inCloset.id], toLocationId: bag.id }))
					.status,
			).toBe(403);
			expect(await db().movement.count()).toBe(0);
		});

		it("lets a wardrobe editor do everything to items", async () => {
			const { elsewhere, closet, loose, inCloset } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit");
			const unplaced = await other.create({ ownerId: closet.ownerId });
			expect(unplaced.status).toBe(201);
			expect(await json<ItemSummaryDto>(unplaced)).toMatchObject({
				ownerId: closet.ownerId,
				access: "edit",
			});
			expect(
				(await other.patch(loose.id, { locationId: elsewhere.id })).status,
			).toBe(200);
			expect(
				(await other.patch(inCloset.id, { locationId: null })).status,
			).toBe(200);
			expect((await other.remove(loose.id)).status).toBe(204);
		});

		it("gives new items to the location's owner and rejects a mismatch", async () => {
			const { closet } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit", closet.id);
			const created = await other.create({ locationId: closet.id });
			expect(created.status).toBe(201);
			expect((await json<ItemSummaryDto>(created)).ownerId).toBe(
				closet.ownerId,
			);
			expect(
				(
					await other.create({
						locationId: closet.id,
						ownerId: await userId(OTHER_USER),
					})
				).status,
			).toBe(422);
		});

		it("files tags under the item's owner, not the editor", async () => {
			const { closet, inCloset } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit", closet.id);
			await other.patch(inCloset.id, { tags: ["wool"] });
			const tags = await db().tag.findMany();
			expect(tags.map((t) => [t.name, t.ownerId])).toEqual([
				["wool", closet.ownerId],
			]);
			await makeItem({ ownerId: await userId(OTHER_USER) });
			expect(ids(await other.list("?tag=wool"))).toEqual([]);
		});

		it("limits a location editor to moves inside the share", async () => {
			const { closet, bag, elsewhere, inCloset, inDrawer } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit", closet.id);
			// Inside the share.
			expect(
				await json(
					await other.move({ itemIds: [inCloset.id], toLocationId: bag.id }),
				),
			).toEqual({ moved: 1 });
			// Out to a location they cannot see, and in from one.
			expect(
				(await other.patch(inCloset.id, { locationId: elsewhere.id })).status,
			).toBe(422);
			expect(
				(
					await other.move({
						itemIds: [inCloset.id],
						toLocationId: elsewhere.id,
					})
				).status,
			).toBe(422);
			expect(
				(await other.move({ itemIds: [inDrawer.id], toLocationId: bag.id }))
					.status,
			).toBe(422);
			// Unplacing leaves the share.
			expect(
				(await other.patch(inCloset.id, { locationId: null })).status,
			).toBe(403);
			expect(
				(await other.move({ itemIds: [inCloset.id], toLocationId: null }))
					.status,
			).toBe(403);
			// A new unplaced item is outside the share too.
			expect((await other.create({ ownerId: closet.ownerId })).status).toBe(
				404,
			);
		});

		it("refuses a move into a location shared view-only", async () => {
			const { closet, elsewhere, inCloset } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit", closet.id);
			await share(TEST_USER, OTHER_USER, "view", elsewhere.id);
			expect(
				(
					await other.move({
						itemIds: [inCloset.id],
						toLocationId: elsewhere.id,
					})
				).status,
			).toBe(403);
		});

		it("422s a move between owners, in either direction", async () => {
			const { closet, inCloset } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit");
			const ownerId = await userId(OTHER_USER);
			const mine = await makeLocation({ code: "MINE", ownerId });
			const myItem = await makeItem({ ownerId, locationId: mine.id });
			for (const response of [
				await other.patch(inCloset.id, { locationId: mine.id }),
				await other.move({ itemIds: [inCloset.id], toLocationId: mine.id }),
				await other.patch(myItem.id, { locationId: closet.id }),
				await other.move({
					itemIds: [myItem.id, inCloset.id],
					toLocationId: closet.id,
				}),
			]) {
				expect(response.status).toBe(422);
			}
			expect(await db().movement.count()).toBe(0);
		});

		it("needs a session from the same wardrobe that the caller can edit", async () => {
			const { closet, elsewhere, inCloset } = await wardrobe();
			await share(TEST_USER, OTHER_USER, "edit", closet.id);
			const session = (locationId: string, ownerId: string) =>
				db().packingSession.create({
					data: { mode: "pack", locationId, ownerId },
				});
			const hidden = await session(elsewhere.id, elsewhere.ownerId);
			const ownerId = await userId(OTHER_USER);
			const mine = await makeLocation({ code: "MINE", ownerId });
			const foreign = await session(mine.id, ownerId);
			const shared = await session(closet.id, closet.ownerId);
			const bag = await makeLocation({ code: "B-9", parentId: closet.id });
			for (const [sessionId, status] of [
				[hidden.id, 422],
				[foreign.id, 422],
				[shared.id, 200],
			] as const) {
				const response = await other.move({
					itemIds: [inCloset.id],
					toLocationId: bag.id,
					sessionId,
				});
				expect(response.status).toBe(status);
			}
		});

		it("redacts movement references to locations the caller cannot read", async () => {
			const { closet, elsewhere, inDrawer } = await wardrobe();
			await patch(inDrawer.id, { locationId: closet.id });
			await share(TEST_USER, THIRD_USER, "view", closet.id);
			await share(TEST_USER, OTHER_USER, "view");

			const limited = await json<ItemDetailDto>(
				await as(THIRD_USER).get(inDrawer.id),
			);
			expect(limited.movements).toHaveLength(1);
			expect(limited.movements[0]?.from).toBeNull();
			expect(limited.movements[0]?.to?.id).toBe(closet.id);

			const full = await json<ItemDetailDto>(await other.get(inDrawer.id));
			expect(full.movements[0]?.from?.id).toBe(elsewhere.id);
			expect(full.access).toBe("view");
		});

		it("stops access as soon as a share is revoked", async () => {
			const { inCloset } = await wardrobe();
			const grant = await share(TEST_USER, OTHER_USER, "edit");
			expect((await other.get(inCloset.id)).status).toBe(200);
			await db().share.delete({ where: { id: grant.id } });
			expect((await other.get(inCloset.id)).status).toBe(404);
		});
	});
});
