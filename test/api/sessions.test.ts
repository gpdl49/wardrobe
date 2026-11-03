import { beforeEach, expect, it } from "vitest";
import { POST as moveItems } from "@/app/api/items/move/route";
import { POST as endSession } from "@/app/api/sessions/[id]/end/route";
import { GET as getSession } from "@/app/api/sessions/[id]/route";
import { POST as postSession } from "@/app/api/sessions/route";
import type {
	PackingSessionDetailDto,
	PackingSessionDto,
} from "@/lib/api/types";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams } from "@/test/helpers/http";

const MISSING = "0190f5a0-0000-7000-8000-000000000000";

const start = (body: unknown) =>
	postSession(apiRequest("/api/sessions", { method: "POST", body }), {});
const end = (id: string) =>
	endSession(
		apiRequest(`/api/sessions/${id}/end`, { method: "POST" }),
		routeParams({ id }),
	);
const get = (id: string) =>
	getSession(apiRequest(`/api/sessions/${id}`), routeParams({ id }));
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
