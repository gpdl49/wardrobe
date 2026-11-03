import { beforeEach, describe, expect, it } from "vitest";
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
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams } from "@/test/helpers/http";

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
