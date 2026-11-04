import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DELETE as deleteLocation,
	GET as getLocation,
	PATCH as patchLocation,
} from "@/app/api/locations/[id]/route";
import { GET as getByCode } from "@/app/api/locations/by-code/[code]/route";
import {
	GET as listLocations,
	POST as postLocation,
} from "@/app/api/locations/route";
import LocationCodePage from "@/app/l/[ownerId]/[code]/page";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import {
	apiRequest,
	json,
	proxyHeaders,
	routeParams,
	TEST_USER,
} from "@/test/helpers/http";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

// The QR page reads the request from next/headers and leaves by throwing.
const page = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => page.headers }));
vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`);
	},
	notFound: () => {
		throw new Error("not-found");
	},
}));

type LocationJson = {
	id: string;
	kind: string;
	code: string;
	name: string;
	notes: string | null;
	parentId: string | null;
	archivedAt: string | null;
	itemCount: number;
};

const MISSING = "0190f5a0-0000-7000-8000-000000000000";

describeWithDb("locations API", () => {
	beforeEach(async () => {
		await resetDb();
	});

	describe("POST /api/locations", () => {
		it("creates a location and normalises the code", async () => {
			const response = await postLocation(
				apiRequest("/api/locations", {
					method: "POST",
					body: { kind: "bag", code: " b-07 ", name: "Winter knits" },
				}),
				{},
			);
			expect(response.status).toBe(201);
			const body = await json<LocationJson>(response);
			expect(body).toMatchObject({
				kind: "bag",
				code: "B-07",
				name: "Winter knits",
				notes: null,
				parentId: null,
				archivedAt: null,
				itemCount: 0,
			});
			expect(await db().location.count()).toBe(1);
		});

		it("400s on invalid input", async () => {
			const response = await postLocation(
				apiRequest("/api/locations", {
					method: "POST",
					body: { kind: "box", code: "", name: "" },
				}),
				{},
			);
			expect(response.status).toBe(400);
			const body = await json<{ error: string; message: string }>(response);
			expect(body.error).toBe("bad_request");
			expect(body.message).toMatch(/kind/);
		});

		it("400s on malformed JSON and unknown fields", async () => {
			const malformed = await postLocation(
				apiRequest("/api/locations", { method: "POST", body: "{" }),
				{},
			);
			expect(malformed.status).toBe(400);
			const unknown = await postLocation(
				apiRequest("/api/locations", {
					method: "POST",
					body: { kind: "bag", code: "B-1", name: "x", colour: "red" },
				}),
				{},
			);
			expect(unknown.status).toBe(400);
		});

		it("409s on a duplicate code (case-insensitive)", async () => {
			await makeLocation({ code: "S-02" });
			const response = await postLocation(
				apiRequest("/api/locations", {
					method: "POST",
					body: { kind: "suitcase", code: "s-02", name: "Big one" },
				}),
				{},
			);
			expect(response.status).toBe(409);
		});

		it("422s on a missing parent", async () => {
			const response = await postLocation(
				apiRequest("/api/locations", {
					method: "POST",
					body: { kind: "bag", code: "B-1", name: "x", parentId: MISSING },
				}),
				{},
			);
			expect(response.status).toBe(422);
		});

		it("401s without auth and writes nothing", async () => {
			const response = await postLocation(
				apiRequest("/api/locations", {
					method: "POST",
					user: null,
					body: { kind: "bag", code: "B-1", name: "x" },
				}),
				{},
			);
			expect(response.status).toBe(401);
			expect(await db().location.count()).toBe(0);
		});
	});

	describe("GET /api/locations", () => {
		it("lists with item counts, filtered by kind and q", async () => {
			const bag = await makeLocation({
				kind: "bag",
				code: "B-01",
				name: "Knits",
			});
			await makeLocation({
				kind: "closet",
				code: "CL-BEDROOM",
				name: "Bedroom",
			});
			await makeItem({ locationId: bag.id });
			await makeItem({ locationId: bag.id });

			const all = await json<LocationJson[]>(
				await listLocations(apiRequest("/api/locations"), {}),
			);
			expect(all.map((l) => [l.code, l.itemCount])).toEqual([
				["B-01", 2],
				["CL-BEDROOM", 0],
			]);

			const closets = await json<LocationJson[]>(
				await listLocations(apiRequest("/api/locations?kind=closet"), {}),
			);
			expect(closets.map((l) => l.code)).toEqual(["CL-BEDROOM"]);

			const search = await json<LocationJson[]>(
				await listLocations(apiRequest("/api/locations?q=knit"), {}),
			);
			expect(search.map((l) => l.code)).toEqual(["B-01"]);
		});

		it("hides archived locations unless archived=true", async () => {
			await makeLocation({ code: "B-OLD", archivedAt: new Date() });
			await makeLocation({ code: "B-NEW" });
			const visible = await json<LocationJson[]>(
				await listLocations(apiRequest("/api/locations"), {}),
			);
			expect(visible.map((l) => l.code)).toEqual(["B-NEW"]);
			const all = await json<LocationJson[]>(
				await listLocations(apiRequest("/api/locations?archived=true"), {}),
			);
			expect(all).toHaveLength(2);
		});

		it("400s on an invalid kind filter", async () => {
			const response = await listLocations(
				apiRequest("/api/locations?kind=box"),
				{},
			);
			expect(response.status).toBe(400);
		});
	});

	describe("GET /api/locations/{id}", () => {
		it("returns items and children", async () => {
			const closet = await makeLocation({ kind: "closet", code: "CL-LOFT" });
			const bag = await makeLocation({ code: "B-07", parentId: closet.id });
			const item = await makeItem({ locationId: closet.id });

			const response = await getLocation(
				apiRequest(`/api/locations/${closet.id}`),
				routeParams({ id: closet.id }),
			);
			expect(response.status).toBe(200);
			const body = await json<
				LocationJson & { items: { id: string }[]; children: { id: string }[] }
			>(response);
			expect(body.itemCount).toBe(1);
			expect(body.items.map((i) => i.id)).toEqual([item.id]);
			expect(body.children.map((c) => c.id)).toEqual([bag.id]);
		});

		it("404s for unknown and non-UUID ids", async () => {
			for (const id of [MISSING, "not-a-uuid"]) {
				const response = await getLocation(
					apiRequest(`/api/locations/${id}`),
					routeParams({ id }),
				);
				expect(response.status).toBe(404);
				expect((await json<{ error: string }>(response)).error).toBe(
					"not_found",
				);
			}
		});
	});

	describe("GET /api/locations/by-code/{code}", () => {
		it("finds a location by code, case-insensitively", async () => {
			const bag = await makeLocation({ code: "B-07" });
			const response = await getByCode(
				apiRequest("/api/locations/by-code/b-07"),
				routeParams({ code: "b-07" }),
			);
			expect(response.status).toBe(200);
			expect((await json<LocationJson>(response)).id).toBe(bag.id);
		});

		it("404s for an unknown code", async () => {
			const response = await getByCode(
				apiRequest("/api/locations/by-code/NOPE"),
				routeParams({ code: "NOPE" }),
			);
			expect(response.status).toBe(404);
		});
	});

	describe("PATCH /api/locations/{id}", () => {
		it("updates fields, archives and unarchives", async () => {
			const bag = await makeLocation({ code: "B-01" });
			const patch = (body: unknown) =>
				patchLocation(
					apiRequest(`/api/locations/${bag.id}`, { method: "PATCH", body }),
					routeParams({ id: bag.id }),
				);

			const renamed = await patch({
				name: "Summer",
				code: "b-02",
				notes: "Top shelf",
			});
			expect(renamed.status).toBe(200);
			expect(await json<LocationJson>(renamed)).toMatchObject({
				name: "Summer",
				code: "B-02",
				notes: "Top shelf",
			});

			const archived = await json<LocationJson>(
				await patch({ archivedAt: "2026-11-01T10:00:00Z" }),
			);
			expect(archived.archivedAt).toBe("2026-11-01T10:00:00.000Z");
			const restored = await json<LocationJson>(
				await patch({ archivedAt: null }),
			);
			expect(restored.archivedAt).toBeNull();
		});

		it("keeps its own code without a conflict", async () => {
			const bag = await makeLocation({ code: "B-01" });
			const response = await patchLocation(
				apiRequest(`/api/locations/${bag.id}`, {
					method: "PATCH",
					body: { code: "B-01" },
				}),
				routeParams({ id: bag.id }),
			);
			expect(response.status).toBe(200);
		});

		it("409s when taking another location's code", async () => {
			await makeLocation({ code: "B-01" });
			const other = await makeLocation({ code: "B-02" });
			const response = await patchLocation(
				apiRequest(`/api/locations/${other.id}`, {
					method: "PATCH",
					body: { code: "B-01" },
				}),
				routeParams({ id: other.id }),
			);
			expect(response.status).toBe(409);
		});

		it("422s on a parent cycle", async () => {
			const outer = await makeLocation({ kind: "closet" });
			const inner = await makeLocation({ parentId: outer.id });
			for (const [id, parentId] of [
				[outer.id, inner.id],
				[outer.id, outer.id],
			] as const) {
				const response = await patchLocation(
					apiRequest(`/api/locations/${id}`, {
						method: "PATCH",
						body: { parentId },
					}),
					routeParams({ id }),
				);
				expect(response.status).toBe(422);
			}
		});

		it("404s for an unknown id", async () => {
			const response = await patchLocation(
				apiRequest(`/api/locations/${MISSING}`, {
					method: "PATCH",
					body: { name: "x" },
				}),
				routeParams({ id: MISSING }),
			);
			expect(response.status).toBe(404);
		});
	});

	describe("DELETE /api/locations/{id}", () => {
		it("deletes an empty location and detaches its children", async () => {
			const closet = await makeLocation({ kind: "closet" });
			const bag = await makeLocation({ parentId: closet.id });
			const response = await deleteLocation(
				apiRequest(`/api/locations/${closet.id}`, { method: "DELETE" }),
				routeParams({ id: closet.id }),
			);
			expect(response.status).toBe(204);
			expect(await response.text()).toBe("");
			expect(
				await db().location.findUnique({ where: { id: closet.id } }),
			).toBeNull();
			expect(
				(await db().location.findUniqueOrThrow({ where: { id: bag.id } }))
					.parentId,
			).toBeNull();
		});

		it("409s while it still holds items", async () => {
			const bag = await makeLocation({ code: "B-09" });
			await makeItem({ locationId: bag.id });
			const response = await deleteLocation(
				apiRequest(`/api/locations/${bag.id}`, { method: "DELETE" }),
				routeParams({ id: bag.id }),
			);
			expect(response.status).toBe(409);
			expect(await json(response)).toMatchObject({ error: "conflict" });
			expect(await db().location.count()).toBe(1);
		});

		it("404s for an unknown id", async () => {
			const response = await deleteLocation(
				apiRequest(`/api/locations/${MISSING}`, { method: "DELETE" }),
				routeParams({ id: MISSING }),
			);
			expect(response.status).toBe(404);
		});
	});

	describe("access", () => {
		type Detail = LocationJson & {
			ownerId: string;
			access: string;
			items: { id: string }[];
			children: { id: string }[];
		};

		const get = (id: string, user = TEST_USER) =>
			getLocation(
				apiRequest(`/api/locations/${id}`, { user }),
				routeParams({ id }),
			);
		const list = async (query = "", user = TEST_USER) =>
			json<(LocationJson & { access: string })[]>(
				await listLocations(apiRequest(`/api/locations${query}`, { user }), {}),
			);
		const create = (body: unknown, user = TEST_USER) =>
			postLocation(
				apiRequest("/api/locations", { method: "POST", body, user }),
				{},
			);
		const patch = (id: string, body: unknown, user = TEST_USER) =>
			patchLocation(
				apiRequest(`/api/locations/${id}`, { method: "PATCH", body, user }),
				routeParams({ id }),
			);
		const remove = (id: string, user = TEST_USER) =>
			deleteLocation(
				apiRequest(`/api/locations/${id}`, { method: "DELETE", user }),
				routeParams({ id }),
			);
		const byCode = (code: string, query = "", user = TEST_USER) =>
			getByCode(
				apiRequest(`/api/locations/by-code/${code}${query}`, { user }),
				routeParams({ code }),
			);

		/** OTHER_USER's closet holding a bag; a separate suitcase beside it. */
		const arrange = async () => {
			const ownerId = await userId(OTHER_USER);
			const closet = await makeLocation({
				ownerId,
				kind: "closet",
				code: "CL-1",
			});
			const bag = await makeLocation({
				ownerId,
				code: "B-1",
				parentId: closet.id,
			});
			const suitcase = await makeLocation({
				ownerId,
				kind: "suitcase",
				code: "S-1",
			});
			return { ownerId, closet, bag, suitcase };
		};

		it("creates in the caller's wardrobe and reports them as owner", async () => {
			const response = await create({ kind: "bag", code: "B-1", name: "x" });
			expect(await json(response)).toMatchObject({
				ownerId: await userId(),
				access: "owner",
			});
		});

		it("keeps codes unique per owner, not globally", async () => {
			const { ownerId } = await arrange();
			const mine = await create({ kind: "bag", code: "B-1", name: "Mine" });
			expect(mine.status).toBe(201);
			const dup = await create({ kind: "bag", code: "b-1", name: "Again" });
			expect(dup.status).toBe(409);
			expect(await db().location.count({ where: { ownerId } })).toBe(3);
		});

		it("hides another user's wardrobe entirely", async () => {
			const { ownerId, closet } = await arrange();
			expect((await get(closet.id)).status).toBe(404);
			expect((await patch(closet.id, { name: "x" })).status).toBe(404);
			expect((await remove(closet.id)).status).toBe(404);
			expect(await list()).toEqual([]);
			expect(await list(`?owner=${ownerId}`)).toEqual([]);
			expect((await byCode("CL-1", `?owner=${ownerId}`)).status).toBe(404);
			expect((await byCode("CL-1")).status).toBe(404);
		});

		it("400s on a malformed owner", async () => {
			const response = await listLocations(
				apiRequest("/api/locations?owner=nope"),
				{},
			);
			expect(response.status).toBe(400);
		});

		it("a view share reads the location and what is nested, and writes nothing", async () => {
			const { ownerId, closet, bag, suitcase } = await arrange();
			await share(OTHER_USER, TEST_USER, "view", closet.id);

			const detail = await json<Detail>(await get(closet.id));
			expect(detail.access).toBe("view");
			expect(detail.children.map((c) => c.id)).toEqual([bag.id]);
			expect((await get(bag.id)).status).toBe(200);
			expect((await get(suitcase.id)).status).toBe(404);

			const rows = await list(`?owner=${ownerId}`);
			expect(rows.map((r) => r.code).sort()).toEqual(["B-1", "CL-1"]);
			expect(rows.every((r) => r.access === "view")).toBe(true);

			expect((await patch(closet.id, { name: "x" })).status).toBe(403);
			expect((await patch(bag.id, { name: "x" })).status).toBe(403);
			expect((await remove(bag.id)).status).toBe(403);
			expect(
				(
					await create({
						kind: "bag",
						code: "B-2",
						name: "x",
						parentId: closet.id,
					})
				).status,
			).toBe(403);
		});

		it("a nested share does not reveal the parent or its siblings", async () => {
			const { ownerId, closet, bag } = await arrange();
			const sibling = await makeLocation({
				ownerId,
				code: "B-2",
				parentId: closet.id,
			});
			await share(OTHER_USER, TEST_USER, "view", bag.id);

			const detail = await json<Detail>(await get(bag.id));
			expect(detail.parentId).toBeNull();
			expect((await get(closet.id)).status).toBe(404);
			expect((await get(sibling.id)).status).toBe(404);
			const rows = await list(`?owner=${ownerId}`);
			expect(rows.map((r) => r.id)).toEqual([bag.id]);
		});

		it("the owner still sees the parent of a shared location", async () => {
			const { closet, bag } = await arrange();
			await share(OTHER_USER, TEST_USER, "view", bag.id);
			const detail = await json<Detail>(await get(bag.id, OTHER_USER));
			expect(detail.parentId).toBe(closet.id);
		});

		it("a location edit share edits but cannot delete or move the shared location", async () => {
			const { closet } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit", closet.id);

			const renamed = await patch(closet.id, { name: "Renamed" });
			expect(renamed.status).toBe(200);
			expect(await json(renamed)).toMatchObject({
				name: "Renamed",
				access: "edit",
			});
			expect((await remove(closet.id)).status).toBe(403);
			expect((await patch(closet.id, { parentId: null })).status).toBe(403);
			expect(await db().location.count({ where: { id: closet.id } })).toBe(1);
		});

		it("does not reveal the shared location's hidden parent", async () => {
			const { closet, suitcase } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit", closet.id);
			await db().location.update({
				where: { id: closet.id },
				data: { parentId: suitcase.id },
			});
			// The real parent, a wrong guess and null all answer the same.
			for (const parentId of [suitcase.id, MISSING, null]) {
				expect((await patch(closet.id, { parentId })).status).toBe(403);
			}
		});

		it("a location editor cannot delete what would leave the share", async () => {
			const { ownerId, closet } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit", closet.id);
			const middle = await makeLocation({
				ownerId,
				code: "N-1",
				parentId: closet.id,
			});
			const inner = await makeLocation({
				ownerId,
				code: "N-2",
				parentId: middle.id,
			});

			// It holds a location that would drop out of the share.
			expect((await remove(middle.id)).status).toBe(403);
			expect(
				(await db().location.findUniqueOrThrow({ where: { id: inner.id } }))
					.parentId,
			).toBe(middle.id);

			// Someone else's share on it would be revoked.
			const directShare = await share(OTHER_USER, THIRD_USER, "view", inner.id);
			expect((await remove(inner.id)).status).toBe(403);
			await db().share.delete({ where: { id: directShare.id } });

			// With neither it goes, and then so can its emptied parent.
			expect((await remove(inner.id)).status).toBe(204);
			expect((await remove(middle.id)).status).toBe(204);
		});

		it("a whole-wardrobe editor can delete a location with children", async () => {
			const { ownerId } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit");
			const parent = await makeLocation({ ownerId, code: "P-1" });
			const child = await makeLocation({
				ownerId,
				code: "P-2",
				parentId: parent.id,
			});
			expect((await remove(parent.id)).status).toBe(204);
			expect(
				(await db().location.findUniqueOrThrow({ where: { id: child.id } }))
					.parentId,
			).toBeNull();
		});

		it("a location edit share restructures what is nested", async () => {
			const { ownerId, closet, bag, suitcase } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit", closet.id);

			const child = await create({
				kind: "bag",
				code: "B-9",
				name: "New",
				parentId: closet.id,
			});
			expect(child.status).toBe(201);
			const created = await json<Detail>(child);
			expect(created).toMatchObject({ ownerId, access: "edit" });

			// Only the wardrobe can take it to the top level or outside the share.
			expect((await patch(bag.id, { parentId: null })).status).toBe(403);
			expect((await patch(bag.id, { parentId: suitcase.id })).status).toBe(422);

			expect((await patch(created.id, { parentId: bag.id })).status).toBe(200);
			expect((await remove(created.id)).status).toBe(204);
			expect((await remove(bag.id)).status).toBe(204);
		});

		it("refuses a top-level location without the wardrobe", async () => {
			const { ownerId, closet } = await arrange();
			const body = { kind: "bag", code: "B-5", name: "x", ownerId };
			expect((await create(body)).status).toBe(404);

			await share(OTHER_USER, TEST_USER, "edit", closet.id);
			expect((await create(body)).status).toBe(404);
		});

		it("a whole-wardrobe view share reads everything and writes nothing", async () => {
			const { ownerId, closet } = await arrange();
			await share(OTHER_USER, TEST_USER, "view");
			expect(await list(`?owner=${ownerId}`)).toHaveLength(3);
			expect((await patch(closet.id, { name: "x" })).status).toBe(403);
			expect(
				(await create({ kind: "bag", code: "B-5", name: "x", ownerId })).status,
			).toBe(403);
		});

		it("a whole-wardrobe edit share can do what the owner can", async () => {
			const { ownerId, closet, bag } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit");

			const created = await create({
				kind: "bag",
				code: "B-5",
				name: "x",
				ownerId,
			});
			expect(created.status).toBe(201);
			expect(await json(created)).toMatchObject({ ownerId, access: "edit" });
			// Codes are checked against the owner's wardrobe.
			expect(
				(await create({ kind: "bag", code: "B-1", name: "x", ownerId })).status,
			).toBe(409);
			expect((await patch(bag.id, { parentId: null })).status).toBe(200);
			expect((await remove(closet.id)).status).toBe(204);
		});

		it("cannot nest across wardrobes", async () => {
			const { ownerId, closet } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit", closet.id);
			const mine = await makeLocation({ code: "B-MINE" });

			const conflicting = await create({
				kind: "bag",
				code: "B-5",
				name: "x",
				parentId: closet.id,
				ownerId: await userId(),
			});
			expect(conflicting.status).toBe(422);
			expect((await patch(mine.id, { parentId: closet.id })).status).toBe(422);
			expect(
				await db().location.count({ where: { ownerId, code: "B-5" } }),
			).toBe(0);
		});

		it("does not reveal an unseen parent", async () => {
			const { closet } = await arrange();
			const mine = await makeLocation({ code: "B-MINE" });
			const missing = await patch(mine.id, { parentId: MISSING });
			const hidden = await patch(mine.id, { parentId: closet.id });
			expect(hidden.status).toBe(422);
			expect(await json(hidden)).toEqual(await json(missing));
		});

		it("by-code looks only in the named wardrobe", async () => {
			const { ownerId, bag } = await arrange();
			const mine = await makeLocation({ code: "B-1" });
			await share(OTHER_USER, TEST_USER, "view", bag.id);

			const own = await json<Detail>(await byCode("b-1"));
			expect(own.id).toBe(mine.id);
			const shared = await json<Detail>(
				await byCode("B-1", `?owner=${ownerId}`),
			);
			expect(shared).toMatchObject({ id: bag.id, access: "view" });
			expect((await byCode("CL-1", `?owner=${ownerId}`)).status).toBe(404);
		});

		it("revoking a share takes effect on the next request", async () => {
			const { closet } = await arrange();
			const row = await share(OTHER_USER, TEST_USER, "view", closet.id);
			expect((await get(closet.id)).status).toBe(200);
			await db().share.delete({ where: { id: row.id } });
			expect((await get(closet.id)).status).toBe(404);
		});

		it("different grantees get only their own grants", async () => {
			const { closet } = await arrange();
			await share(OTHER_USER, TEST_USER, "edit", closet.id);
			expect((await get(closet.id, THIRD_USER)).status).toBe(404);
		});
	});

	describe("QR page /l/[ownerId]/[code]", () => {
		const visit = async (
			ownerId: string,
			code: string,
			then?: string,
			user = TEST_USER,
		) => {
			page.headers = new Headers(proxyHeaders(user));
			try {
				await LocationCodePage({
					params: Promise.resolve({ ownerId, code }),
					searchParams: Promise.resolve(then ? { then } : {}),
				} as Parameters<typeof LocationCodePage>[0]);
			} catch (err) {
				return (err as Error).message;
			}
			return "rendered";
		};

		it("redirects to the owner's location", async () => {
			const bag = await makeLocation({ code: "B-07" });
			const me = await userId();
			expect(await visit(me, "b-07")).toBe(`redirect:/locations/${bag.id}`);
			expect(await visit(me, "B-07", "pack")).toBe(
				`redirect:/pack?location=${bag.id}`,
			);
			expect(await visit(me, "B-07", "unpack")).toBe(
				`redirect:/unpack?location=${bag.id}`,
			);
		});

		it("never falls back to another wardrobe with the same code", async () => {
			const theirs = await userId(OTHER_USER);
			await makeLocation({ code: "B-07" });
			await makeLocation({ ownerId: theirs, code: "B-07" });
			expect(await visit(theirs, "B-07")).toBe("not-found");
		});

		it("opens a shared location for its grantee", async () => {
			const theirs = await userId(OTHER_USER);
			const bag = await makeLocation({ ownerId: theirs, code: "B-07" });
			await share(OTHER_USER, TEST_USER, "view", bag.id);
			expect(await visit(theirs, "B-07")).toBe(`redirect:/locations/${bag.id}`);
		});

		it("offers to create an unknown code only to its owner", async () => {
			const me = await userId();
			const theirs = await userId(OTHER_USER);
			expect(await visit(me, "b-99", "pack")).toBe("redirect:/pack?code=B-99");
			expect(await visit(me, "B-99")).toBe("not-found");
			expect(await visit(theirs, "B-99", "pack")).toBe("not-found");
		});

		it("is a 404 for a malformed owner id", async () => {
			expect(await visit("nope", "B-07")).toBe("not-found");
		});

		it("is a 404 when not signed in or outside the required group", async () => {
			const me = await userId();
			await makeLocation({ code: "B-07" });
			const open = (headers: Headers) => {
				page.headers = headers;
				return LocationCodePage({
					params: Promise.resolve({ ownerId: me, code: "B-07" }),
					searchParams: Promise.resolve({}),
				} as Parameters<typeof LocationCodePage>[0]);
			};
			await expect(open(new Headers())).rejects.toThrow("not-found");
			await expect(
				open(new Headers(proxyHeaders({ ...TEST_USER, groups: ["other"] }))),
			).rejects.toThrow("not-found");
		});
	});
});

describe("locations API without a database", () => {
	it("still rejects unauthenticated requests before touching it", async () => {
		const response = await listLocations(
			apiRequest("/api/locations", { user: null }),
			{},
		);
		expect(response.status).toBe(401);
	});
});
