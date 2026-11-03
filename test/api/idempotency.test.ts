import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postItem } from "@/app/api/items/route";
import { POST as postPhoto } from "@/app/api/photos/route";
import { POST as postSession } from "@/app/api/sessions/route";
import type { ItemSummaryDto, PhotoUploadDto } from "@/lib/api/types";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/http/handler";
import {
	IDEMPOTENCY_LOCK_MS,
	IDEMPOTENCY_TTL_MS,
	withIdempotency,
} from "@/lib/http/idempotency";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, TEST_USER } from "@/test/helpers/http";
import { type FakeS3, installFakeS3 } from "@/test/helpers/s3";

vi.mock("@/lib/jobs/queue", () => ({
	enqueue: vi.fn(async () => "job-1"),
	getBoss: vi.fn(),
	stopBoss: vi.fn(),
}));

const OTHER_USER: User = { ...TEST_USER, sub: "other-sub" };

type PostOptions = { key?: string; user?: User };

const request = (path: string, body: unknown, options: PostOptions = {}) =>
	apiRequest(path, {
		method: "POST",
		body,
		user: options.user,
		headers: options.key ? { "Idempotency-Key": options.key } : {},
	});

const createItem = (body: unknown, options?: PostOptions) =>
	postItem(request("/api/items", body, options), {});

const itemCount = () => db().item.count();
const keyRows = () => db().idempotencyKey.findMany();
const replayed = (response: Response) =>
	response.headers.get("idempotent-replayed");

/** A resolvable gate, to hold a handler mid-flight. */
function gate() {
	let open!: () => void;
	const promise = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { promise, open };
}

describeWithDb("Idempotency-Key", () => {
	let locationId: string;

	beforeEach(async () => {
		await resetDb();
		locationId = (await makeLocation()).id;
	});

	describe("POST /api/items", () => {
		it("behaves as before without the header", async () => {
			const first = await createItem({ locationId });
			const second = await createItem({ locationId });
			expect(first.status).toBe(201);
			expect(second.status).toBe(201);
			expect(replayed(second)).toBeNull();
			expect(await itemCount()).toBe(2);
			expect(await keyRows()).toEqual([]);
		});

		it("replays the stored response for a repeat with the same body", async () => {
			const body = { locationId, name: "Coat" };
			const first = await createItem(body, { key: "item-job-1" });
			expect(first.status).toBe(201);
			expect(replayed(first)).toBeNull();
			const created = await json<ItemSummaryDto>(first);

			const second = await createItem(body, { key: "item-job-1" });
			expect(second.status).toBe(201);
			expect(replayed(second)).toBe("true");
			expect(await json(second)).toEqual(created);
			expect(await itemCount()).toBe(1);

			const [row] = await keyRows();
			expect(row).toMatchObject({
				sub: TEST_USER.sub,
				key: "item-job-1",
				route: "POST /api/items",
				status: 201,
			});
			expect(row?.requestHash).toMatch(/^[0-9a-f]{64}$/);
			expect(row?.completedAt).toBeInstanceOf(Date);
		});

		it("422s a reused key with a different body", async () => {
			await createItem({ locationId, name: "Coat" }, { key: "k" });
			const response = await createItem(
				{ locationId, name: "Hat" },
				{ key: "k" },
			);
			expect(response.status).toBe(422);
			expect(await json(response)).toMatchObject({
				error: "idempotency_key_reused",
			});
			expect(await itemCount()).toBe(1);
		});

		it("422s a reused key on a different route", async () => {
			await createItem({ locationId }, { key: "k" });
			const response = await postSession(
				request("/api/sessions", { mode: "pack", locationId }, { key: "k" }),
				{},
			);
			expect(response.status).toBe(422);
			expect(await json(response)).toMatchObject({
				error: "idempotency_key_reused",
			});
			expect(await db().packingSession.count()).toBe(0);
		});

		it("stores and replays 4xx responses", async () => {
			const first = await createItem({ bogus: true }, { key: "k" });
			expect(first.status).toBe(400);
			const second = await createItem({ bogus: true }, { key: "k" });
			expect(second.status).toBe(400);
			expect(replayed(second)).toBe("true");
			expect(await json(second)).toEqual(await json(first));
		});

		it("400s an invalid key without running the handler", async () => {
			const response = await createItem(
				{ locationId },
				{ key: "x".repeat(201) },
			);
			expect(response.status).toBe(400);
			expect(await json(response)).toMatchObject({
				error: "invalid_idempotency_key",
			});
			expect(await itemCount()).toBe(0);
		});

		it("scopes keys per user", async () => {
			const mine = await createItem({ locationId }, { key: "shared" });
			const theirs = await createItem(
				{ locationId },
				{ key: "shared", user: OTHER_USER },
			);
			expect(mine.status).toBe(201);
			expect(theirs.status).toBe(201);
			expect(replayed(theirs)).toBeNull();
			expect((await json<ItemSummaryDto>(theirs)).id).not.toBe(
				(await json<ItemSummaryDto>(mine)).id,
			);
			expect(await itemCount()).toBe(2);
		});

		it("forgets keys after the TTL", async () => {
			await createItem({ locationId }, { key: "old" });
			await createItem({ locationId }, { key: "recent" });
			await db().idempotencyKey.updateMany({
				where: { key: "old" },
				data: { createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1000) },
			});

			// Any keyed write purges expired rows; the old key works afresh.
			const again = await createItem(
				{ locationId, name: "New" },
				{ key: "old" },
			);
			expect(again.status).toBe(201);
			expect(replayed(again)).toBeNull();
			expect(await itemCount()).toBe(3);
			expect((await keyRows()).map((r) => r.key).sort()).toEqual([
				"old",
				"recent",
			]);
		});

		it("lets only one of two concurrent duplicates create", async () => {
			const body = { locationId, name: "Race" };
			const responses = await Promise.all(
				Array.from({ length: 5 }, () => createItem(body, { key: "race" })),
			);
			const statuses = responses.map((r) => r.status);
			expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
			expect(
				responses.filter((r) => r.status === 201 && !replayed(r)),
			).toHaveLength(1);
			expect(await itemCount()).toBe(1);
		});
	});

	describe("withIdempotency", () => {
		const path = "/api/test";
		const call = (
			handler: Parameters<typeof withIdempotency>[0],
			body: unknown,
			key = "k",
		) => withAuth(withIdempotency(handler))(request(path, body, { key }), {});

		it("409s a duplicate while the first is in flight, then replays", async () => {
			const held = gate();
			let runs = 0;
			const handler = async () => {
				runs++;
				await held.promise;
				return Response.json({ ok: runs }, { status: 201 });
			};
			const first = call(handler, { a: 1 });
			await vi.waitFor(() => expect(runs).toBe(1));

			const duplicate = await call(handler, { a: 1 });
			expect(duplicate.status).toBe(409);
			expect(duplicate.headers.get("retry-after")).toBe("1");
			expect(await json(duplicate)).toMatchObject({
				error: "idempotency_in_progress",
			});

			held.open();
			expect((await first).status).toBe(201);
			const replay = await call(handler, { a: 1 });
			expect(replay.status).toBe(201);
			expect(await json(replay)).toEqual({ ok: 1 });
			expect(runs).toBe(1);
		});

		it("does not store 5xx responses, so a retry runs again", async () => {
			let runs = 0;
			const handler = async () => {
				runs++;
				if (runs === 1) {
					throw new Error("database exploded");
				}
				return Response.json({ ok: true }, { status: 201 });
			};
			vi.spyOn(console, "error").mockImplementation(() => {});

			const failed = await call(handler, { a: 1 });
			expect(failed.status).toBe(500);
			expect(await keyRows()).toEqual([]);

			const retried = await call(handler, { a: 1 });
			expect(retried.status).toBe(201);
			expect(replayed(retried)).toBeNull();
			expect(runs).toBe(2);
			vi.restoreAllMocks();
		});

		it("does not store a 503 returned (not thrown) either", async () => {
			let runs = 0;
			const handler = async () => {
				runs++;
				return runs === 1
					? Response.json({ error: "unavailable" }, { status: 503 })
					: Response.json({ ok: true });
			};
			expect((await call(handler, {})).status).toBe(503);
			expect((await call(handler, {})).status).toBe(200);
			expect(runs).toBe(2);
		});

		it("takes over a pending key whose request died", async () => {
			let runs = 0;
			const handler = async () => {
				runs++;
				return Response.json({ ok: true }, { status: 201 });
			};
			const held = gate();
			const first = withAuth(
				withIdempotency(async () => {
					await held.promise;
					throw new Error("never answers");
				}),
			);
			const pending = first(request(path, {}, { key: "k" }), {});
			await vi.waitFor(async () => expect(await keyRows()).toHaveLength(1));

			expect((await call(handler, {})).status).toBe(409);
			await db().idempotencyKey.updateMany({
				data: { lockedAt: new Date(Date.now() - IDEMPOTENCY_LOCK_MS - 1000) },
			});
			const taken = await call(handler, {});
			expect(taken.status).toBe(201);
			expect(runs).toBe(1);

			// The original finally fails: it no longer owns the key, so the
			// takeover's stored response survives.
			vi.spyOn(console, "error").mockImplementation(() => {});
			held.open();
			expect((await pending).status).toBe(500);
			vi.restoreAllMocks();
			const replay = await call(handler, {});
			expect(replay.status).toBe(201);
			expect(replayed(replay)).toBe("true");
			expect(runs).toBe(1);
		});

		it("passes the body through to the handler", async () => {
			const response = await call(
				async (req) => Response.json(await req.json()),
				{ hello: "world" },
			);
			expect(await json(response)).toEqual({ hello: "world" });
		});
	});

	describe("POST /api/photos", () => {
		let s3: FakeS3;

		beforeEach(() => {
			s3 = installFakeS3();
		});

		afterEach(() => {
			s3.restore();
		});

		const createPhoto = (body: unknown, key: string) =>
			postPhoto(request("/api/photos", body, { key }), {});

		it("replays the same pending photo with a freshly presigned PUT", async () => {
			const item = await makeItem();
			const body = {
				itemId: item.id,
				kind: "main",
				contentType: "image/jpeg",
				size: 1234,
			};
			const first = await json<PhotoUploadDto>(
				await createPhoto(body, "photo-job-1"),
			);

			// Presigned URLs embed the signing time (whole seconds).
			await new Promise((resolve) => setTimeout(resolve, 1100));
			const response = await createPhoto(body, "photo-job-1");
			expect(response.status).toBe(201);
			expect(replayed(response)).toBe("true");
			const second = await json<PhotoUploadDto>(response);
			expect(second.photo.id).toBe(first.photo.id);
			expect(second.uploadUrl).not.toBe(first.uploadUrl);
			expect(second.uploadUrl).toContain(`photos/${first.photo.id}/original`);
			expect(second.uploadHeaders).toEqual(first.uploadHeaders);
			expect(await db().photo.count()).toBe(1);
		});

		it("replays as stored once the photo is no longer pending", async () => {
			const body = { kind: "main", contentType: "image/jpeg", size: 1234 };
			const first = await json<PhotoUploadDto>(await createPhoto(body, "p"));
			await db().photo.update({
				where: { id: first.photo.id },
				data: { status: "ready" },
			});
			const second = await json<PhotoUploadDto>(await createPhoto(body, "p"));
			expect(second).toEqual(first);
		});
	});

	describe("POST /api/sessions", () => {
		it("replays a session start", async () => {
			const body = { mode: "pack", locationId };
			const first = await postSession(
				request("/api/sessions", body, { key: "s" }),
				{},
			);
			const second = await postSession(
				request("/api/sessions", body, { key: "s" }),
				{},
			);
			expect(second.status).toBe(201);
			expect(await json(second)).toEqual(await json(first));
			expect(await db().packingSession.count()).toBe(1);
		});
	});
});

describe("withIdempotency without a key", () => {
	it("calls the handler directly (no database)", async () => {
		const response = await withAuth(
			withIdempotency(async () => Response.json({ ok: true }, { status: 201 })),
		)(apiRequest("/api/test", { method: "POST", body: {} }), {});
		expect(response.status).toBe(201);
	});
});
