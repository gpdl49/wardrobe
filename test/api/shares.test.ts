import { beforeEach, expect, it } from "vitest";
import { GET as sharedWithMe } from "@/app/api/shared-with-me/route";
import { DELETE, PATCH } from "@/app/api/shares/[id]/route";
import { GET, POST } from "@/app/api/shares/route";
import type { ShareDto, SharedWithMeDto } from "@/lib/api/types";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import {
	accessFor,
	OTHER_USER,
	share,
	THIRD_USER,
	userId,
} from "@/test/helpers/users";

const OWNER = TEST_USER;
const MISSING_ID = "00000000-0000-7000-8000-000000000000";

const post = (body: unknown, user: User = OWNER) =>
	POST(apiRequest("/api/shares", { method: "POST", body, user }), {});

const list = async (user: User = OWNER) =>
	json<ShareDto[]>(await GET(apiRequest("/api/shares", { user }), {}));

const patch = (id: string, body: unknown, user: User = OWNER) =>
	PATCH(
		apiRequest(`/api/shares/${id}`, { method: "PATCH", body, user }),
		routeParams({ id }),
	);

const remove = (id: string, user: User = OWNER) =>
	DELETE(
		apiRequest(`/api/shares/${id}`, { method: "DELETE", user }),
		routeParams({ id }),
	);

async function makeLocation(owner: User = OWNER, code = "B-01") {
	return db().location.create({
		data: {
			ownerId: await userId(owner),
			kind: "bag",
			code,
			name: `Bag ${code}`,
		},
	});
}

describeWithDb("shares API", () => {
	beforeEach(async () => {
		await resetDb();
		await userId(OWNER);
		await userId(OTHER_USER);
		await userId(THIRD_USER);
	});

	it("shares a whole wardrobe, resolving the grantee by email", async () => {
		const response = await post({
			grantee: OTHER_USER.email,
			access: "view",
		});
		expect(response.status).toBe(201);
		const body = await json<ShareDto>(response);
		expect(body).toMatchObject({
			ownerId: await userId(OWNER),
			grantee: {
				id: await userId(OTHER_USER),
				email: OTHER_USER.email,
				username: OTHER_USER.username,
			},
			access: "view",
			location: null,
		});
		expect(await list()).toEqual([body]);
	});

	it("shares a location, resolving the grantee by username", async () => {
		const location = await makeLocation();
		const response = await post({
			grantee: OTHER_USER.username,
			access: "edit",
			locationId: location.id,
		});
		expect(response.status).toBe(201);
		expect(await json<ShareDto>(response)).toMatchObject({
			grantee: { id: await userId(OTHER_USER) },
			access: "edit",
			location: {
				id: location.id,
				kind: "bag",
				code: "B-01",
				name: "Bag B-01",
			},
		});
	});

	it("finds the grantee case-insensitively", async () => {
		const byEmail = await post({
			grantee: " OTHER@Example.COM ",
			access: "view",
		});
		expect(byEmail.status).toBe(201);
		const byUsername = await post({ grantee: "THIRD", access: "view" });
		expect(byUsername.status).toBe(201);
	});

	it("422s an unknown grantee, yourself and an ambiguous match", async () => {
		expect((await post({ grantee: "nobody", access: "view" })).status).toBe(
			422,
		);
		expect((await post({ grantee: OWNER.email, access: "view" })).status).toBe(
			422,
		);
		await db().user.create({
			data: { sub: "twin-sub", email: "OTHER@example.com", username: "twin" },
		});
		const ambiguous = await post({
			grantee: OTHER_USER.email,
			access: "view",
		});
		expect(ambiguous.status).toBe(422);
		expect(await json(ambiguous)).toMatchObject({
			message: expect.stringContaining("More than one"),
		});
		expect(await db().share.count()).toBe(0);
	});

	it("treats one person matching by both email and username as one", async () => {
		await db().user.update({
			where: { sub: OTHER_USER.sub },
			data: { username: OTHER_USER.email },
		});
		const response = await post({ grantee: OTHER_USER.email, access: "view" });
		expect(response.status).toBe(201);
	});

	it("422s a location the caller does not own, or that is missing", async () => {
		const theirs = await makeLocation(OTHER_USER);
		for (const locationId of [theirs.id, MISSING_ID]) {
			const response = await post({
				grantee: THIRD_USER.email,
				access: "view",
				locationId,
			});
			expect(response.status).toBe(422);
		}
		expect(await db().share.count()).toBe(0);
	});

	it("400s a bad body", async () => {
		expect((await post({ grantee: "x", access: "owner" })).status).toBe(400);
		expect((await post({ access: "view" })).status).toBe(400);
		expect(
			(await post({ grantee: "x", access: "view", extra: true })).status,
		).toBe(400);
	});

	it("409s a duplicate whole-wardrobe share, whatever the access", async () => {
		const input = { grantee: OTHER_USER.email, access: "view" };
		expect((await post(input)).status).toBe(201);
		const duplicate = await post({ ...input, access: "edit" });
		expect(duplicate.status).toBe(409);
		expect(await json(duplicate)).toMatchObject({ error: "conflict" });
		expect(await db().share.count()).toBe(1);
	});

	it("409s a duplicate location share but allows other locations", async () => {
		const first = await makeLocation();
		const second = await makeLocation(OWNER, "B-02");
		const input = {
			grantee: OTHER_USER.email,
			access: "view",
			locationId: first.id,
		};
		expect((await post(input)).status).toBe(201);
		expect((await post(input)).status).toBe(409);
		expect((await post({ ...input, locationId: second.id })).status).toBe(201);
		// A whole-wardrobe share alongside location shares is a separate grant.
		expect(
			(await post({ grantee: OTHER_USER.email, access: "view" })).status,
		).toBe(201);
	});

	it("lists only the caller's outgoing shares, oldest first", async () => {
		const mine = await share(OWNER, OTHER_USER, "view");
		const mineToo = await share(OWNER, THIRD_USER, "edit");
		const incoming = await share(OTHER_USER, OWNER, "edit");

		const shares = await list();
		expect(shares.map((s) => s.id)).toEqual([mine.id, mineToo.id]);
		expect((await list(OTHER_USER)).map((s) => s.id)).toEqual([incoming.id]);
		expect(await list(THIRD_USER)).toEqual([]);
	});

	it("changes the access level", async () => {
		const created = await share(OWNER, OTHER_USER, "view");
		const response = await patch(created.id, { access: "edit" });
		expect(response.status).toBe(200);
		expect(await json<ShareDto>(response)).toMatchObject({
			id: created.id,
			access: "edit",
		});
		expect((await accessFor(OTHER_USER)).wardrobes.get(created.ownerId)).toBe(
			"edit",
		);
	});

	it("only accepts access in a PATCH", async () => {
		const created = await share(OWNER, OTHER_USER, "view");
		const response = await patch(created.id, { granteeId: MISSING_ID });
		expect(response.status).toBe(400);
	});

	it("404s PATCH and DELETE from anyone but the owner", async () => {
		const created = await share(OWNER, OTHER_USER, "view");
		for (const user of [OTHER_USER, THIRD_USER]) {
			expect((await patch(created.id, { access: "edit" }, user)).status).toBe(
				404,
			);
			expect((await remove(created.id, user)).status).toBe(404);
		}
		const row = await db().share.findUniqueOrThrow({
			where: { id: created.id },
		});
		expect(row.access).toBe("view");
	});

	it("404s PATCH and DELETE of a missing or malformed id", async () => {
		for (const id of [MISSING_ID, "not-a-uuid"]) {
			expect((await patch(id, { access: "edit" })).status).toBe(404);
			expect((await remove(id)).status).toBe(404);
		}
	});

	it("does not let a whole-wardrobe editor manage shares", async () => {
		const location = await makeLocation();
		await share(OWNER, OTHER_USER, "edit");
		const third = await share(OWNER, THIRD_USER, "view");

		// Nothing of the owner's shows up in the editor's own list.
		expect(await list(OTHER_USER)).toEqual([]);
		expect((await patch(third.id, { access: "edit" }, OTHER_USER)).status).toBe(
			404,
		);
		expect((await remove(third.id, OTHER_USER)).status).toBe(404);
		// Re-sharing the owner's location is refused.
		const reshare = await post(
			{ grantee: THIRD_USER.email, access: "view", locationId: location.id },
			OTHER_USER,
		);
		expect(reshare.status).toBe(422);
		expect(await db().share.count()).toBe(2);
	});

	it("takes revocation into account on the next request", async () => {
		const location = await makeLocation();
		const wardrobe = await share(OWNER, OTHER_USER, "view");
		const single = await share(OWNER, THIRD_USER, "edit", location.id);
		const ownerId = await userId(OWNER);
		expect((await accessFor(OTHER_USER)).wardrobes.get(ownerId)).toBe("view");
		expect((await accessFor(THIRD_USER)).locations.get(location.id)).toEqual({
			ownerId,
			access: "edit",
		});

		expect((await remove(wardrobe.id)).status).toBe(204);
		expect((await remove(single.id)).status).toBe(204);

		expect((await accessFor(OTHER_USER)).wardrobes.size).toBe(0);
		expect((await accessFor(THIRD_USER)).locations.size).toBe(0);
		expect((await remove(single.id)).status).toBe(404);
	});

	it("expands a location share down the tree", async () => {
		const parent = await makeLocation();
		const child = await db().location.create({
			data: {
				ownerId: parent.ownerId,
				kind: "bag",
				code: "B-02",
				name: "Nested",
				parentId: parent.id,
			},
		});
		const elsewhere = await makeLocation(OWNER, "B-03");
		await share(OWNER, OTHER_USER, "view", parent.id);

		const ctx = await accessFor(OTHER_USER);
		expect(ctx.locations.has(parent.id)).toBe(true);
		expect(ctx.locations.has(child.id)).toBe(true);
		expect(ctx.locations.has(elsewhere.id)).toBe(false);
		expect(ctx.sharedRoots.has(child.id)).toBe(false);
	});

	it("removes a location's shares with the location", async () => {
		const location = await makeLocation();
		const kept = await share(OWNER, OTHER_USER, "view");
		await share(OWNER, THIRD_USER, "edit", location.id);

		await db().location.delete({ where: { id: location.id } });

		expect((await list()).map((s) => s.id)).toEqual([kept.id]);
	});

	it("lists what is shared with the caller", async () => {
		const location = await makeLocation(OTHER_USER);
		const wardrobe = await share(THIRD_USER, OWNER, "view");
		const single = await share(OTHER_USER, OWNER, "edit", location.id);
		await share(OWNER, THIRD_USER, "view");

		const response = await sharedWithMe(apiRequest("/api/shared-with-me"), {});
		expect(response.status).toBe(200);
		expect(await json<SharedWithMeDto[]>(response)).toEqual([
			{
				id: wardrobe.id,
				owner: {
					id: await userId(THIRD_USER),
					email: THIRD_USER.email,
					username: THIRD_USER.username,
				},
				access: "view",
				location: null,
			},
			{
				id: single.id,
				owner: {
					id: await userId(OTHER_USER),
					email: OTHER_USER.email,
					username: OTHER_USER.username,
				},
				access: "edit",
				location: { id: location.id, code: "B-01", name: "Bag B-01" },
			},
		]);
	});

	it("401s without oauth2-proxy headers", async () => {
		const response = await GET(apiRequest("/api/shares", { user: null }), {});
		expect(response.status).toBe(401);
	});
});
