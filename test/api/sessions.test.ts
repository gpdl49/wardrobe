import { beforeEach, describe, expect, it } from "vitest";
import { POST as moveItems } from "@/app/api/items/move/route";
import { POST as endSession } from "@/app/api/sessions/[id]/end/route";
import { GET as getSession } from "@/app/api/sessions/[id]/route";
import { POST as postSession } from "@/app/api/sessions/route";
import type {
	PackingSessionDetailDto,
	PackingSessionDto,
} from "@/lib/api/types";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { OTHER_USER, share, userId } from "@/test/helpers/users";

const MISSING = "0190f5a0-0000-7000-8000-000000000000";

const start = (body: unknown, user = TEST_USER) =>
	postSession(apiRequest("/api/sessions", { method: "POST", body, user }), {});
const end = (id: string, user = TEST_USER) =>
	endSession(
		apiRequest(`/api/sessions/${id}/end`, { method: "POST", user }),
		routeParams({ id }),
	);
const get = (id: string, user = TEST_USER) =>
	getSession(apiRequest(`/api/sessions/${id}`, { user }), routeParams({ id }));
const move = (body: unknown) =>
	moveItems(apiRequest("/api/items/move", { method: "POST", body }), {});

describeWithDb("sessions API", () => {
	beforeEach(async () => {
		await resetDb();
	});

	it("starts, records moves and ends a session", async () => {
		const bag = await makeLocation({ kind: "bag", code: "B-07" });
		const response = await start({ mode: "pack", locationId: bag.id });
		expect(response.status).toBe(201);
		const session = await json<PackingSessionDto>(response);
		expect(session).toEqual({
			id: expect.any(String),
			ownerId: await userId(),
			access: "owner",
			mode: "pack",
			locationId: bag.id,
			startedAt: expect.any(String),
			endedAt: null,
		});

		const packed = await makeItem();
		const untouched = await makeItem();
		expect(
			(
				await move({
					itemIds: [packed.id],
					toLocationId: bag.id,
					sessionId: session.id,
				})
			).status,
		).toBe(200);

		const detail = await json<PackingSessionDetailDto>(await get(session.id));
		expect(detail.location).toEqual({
			id: bag.id,
			kind: "bag",
			code: "B-07",
			name: bag.name,
		});
		expect(detail.items.map((i) => i.id)).toEqual([packed.id]);
		expect(detail.items[0]?.status).toBe("stored");
		expect(detail.items.map((i) => i.id)).not.toContain(untouched.id);

		const ended = await json<PackingSessionDto>(await end(session.id));
		expect(ended.endedAt).not.toBeNull();
		// Idempotent.
		expect((await json<PackingSessionDto>(await end(session.id))).endedAt).toBe(
			ended.endedAt,
		);

		// An ended session accepts no more moves.
		const late = await move({
			itemIds: [untouched.id],
			toLocationId: bag.id,
			sessionId: session.id,
		});
		expect(late.status).toBe(409);
	});

	it("validates input", async () => {
		expect((await start({ mode: "pack", locationId: MISSING })).status).toBe(
			422,
		);
		const bag = await makeLocation();
		expect((await start({ mode: "stash", locationId: bag.id })).status).toBe(
			400,
		);
	});

	it("404s on unknown and non-UUID ids", async () => {
		for (const id of [MISSING, "nope"]) {
			expect((await get(id)).status).toBe(404);
			expect((await end(id)).status).toBe(404);
		}
	});

	describe("access", () => {
		/** TEST_USER's bag with one session; the item was moved in it. */
		const arrange = async () => {
			const bag = await makeLocation({ code: "B-07" });
			const session = await db().packingSession.create({
				data: { ownerId: bag.ownerId, mode: "pack", locationId: bag.id },
			});
			const item = await makeItem({ locationId: bag.id });
			await db().movement.create({
				data: { itemId: item.id, toLocationId: bag.id, sessionId: session.id },
			});
			return { bag, session, item };
		};

		it("hides sessions from users without access", async () => {
			const { bag, session } = await arrange();
			expect((await get(session.id, OTHER_USER)).status).toBe(404);
			expect((await end(session.id, OTHER_USER)).status).toBe(404);
			// Same answer as a location that does not exist.
			expect(
				(await start({ mode: "pack", locationId: bag.id }, OTHER_USER)).status,
			).toBe(422);
			expect(await db().packingSession.count()).toBe(1);
		});

		it("lets view access read but not write", async () => {
			const { bag, session, item } = await arrange();
			await share(TEST_USER, OTHER_USER, "view", bag.id);

			const response = await get(session.id, OTHER_USER);
			expect(response.status).toBe(200);
			const detail = await json<PackingSessionDetailDto>(response);
			expect(detail.access).toBe("view");
			expect(detail.items.map((i) => i.id)).toEqual([item.id]);

			expect((await end(session.id, OTHER_USER)).status).toBe(403);
			const before = await db().packingSession.count();
			expect(
				(await start({ mode: "pack", locationId: bag.id }, OTHER_USER)).status,
			).toBe(403);
			expect(await db().packingSession.count()).toBe(before);
		});

		it("gives a session started by an editor to the location's owner", async () => {
			const { bag } = await arrange();
			await share(TEST_USER, OTHER_USER, "edit", bag.id);

			const response = await start(
				{ mode: "unpack", locationId: bag.id },
				OTHER_USER,
			);
			expect(response.status).toBe(201);
			const session = await json<PackingSessionDto>(response);
			expect(session.ownerId).toBe(await userId());
			expect(session.access).toBe("edit");

			const ended = await end(session.id, OTHER_USER);
			expect(ended.status).toBe(200);
			expect((await json<PackingSessionDto>(ended)).endedAt).not.toBeNull();
		});

		it("lists only the session's items the caller can read", async () => {
			const closet = await makeLocation({ kind: "closet", code: "CL-1" });
			const { bag, session, item } = await arrange();
			const elsewhere = await makeItem({ locationId: closet.id });
			await db().movement.create({
				data: {
					itemId: elsewhere.id,
					fromLocationId: bag.id,
					toLocationId: closet.id,
					sessionId: session.id,
				},
			});
			await share(TEST_USER, OTHER_USER, "view", bag.id);

			const detail = await json<PackingSessionDetailDto>(
				await get(session.id, OTHER_USER),
			);
			expect(detail.items.map((i) => i.id)).toEqual([item.id]);
			const owner = await json<PackingSessionDetailDto>(await get(session.id));
			expect(owner.items).toHaveLength(2);
		});
	});

	it("422s when moving into an unknown session", async () => {
		const bag = await makeLocation();
		const item = await makeItem();
		expect(
			(
				await move({
					itemIds: [item.id],
					toLocationId: bag.id,
					sessionId: MISSING,
				})
			).status,
		).toBe(422);
	});
});
