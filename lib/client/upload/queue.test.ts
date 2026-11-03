import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, nextStep } from "@/lib/client/upload/queue";
import {
	deferred,
	fakeBackend,
	fakePrepare,
	itemDto,
	json,
	makeQueue,
	photo,
} from "@/lib/client/upload/test-helpers";
import type { UploadJob } from "@/lib/client/upload/types";

let backend: ReturnType<typeof fakeBackend>;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	backend = fakeBackend();
	vi.stubGlobal("fetch", backend.fetch);
	fakePrepare.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const LOCATION = "loc-1";

describe("nextStep", () => {
	const base = {
		createItem: true,
		prepared: true,
		itemId: "i",
		photoId: "p",
		uploaded: true,
		photo: {},
		fieldsVersion: 0,
		syncedFieldsVersion: 0,
	} as unknown as UploadJob;

	it.each([
		[{ prepared: false }, "prepare"],
		[{ itemId: null }, "createItem"],
		[{ photoId: null }, "createPhoto"],
		[{ uploaded: false }, "upload"],
		[{ photo: null }, "complete"],
		[{ fieldsVersion: 2, syncedFieldsVersion: 1 }, "updateItem"],
		[{}, null],
		// Extra photos never create or patch an item.
		[{ createItem: false, itemId: null, photoId: null }, "createPhoto"],
		[{ createItem: false, fieldsVersion: 3 }, null],
	] as const)("%o -> %s", (changes, step) => {
		expect(nextStep({ ...base, ...changes } as UploadJob)).toBe(step);
	});
});

describe("backoffDelay", () => {
	it("doubles from one second, with jitter between half and full", () => {
		expect(backoffDelay(1, () => 1)).toBe(1000);
		expect(backoffDelay(2, () => 1)).toBe(2000);
		expect(backoffDelay(4, () => 1)).toBe(8000);
		expect(backoffDelay(3, () => 0)).toBe(2000);
	});

	it("caps at a minute", () => {
		expect(backoffDelay(20, () => 1)).toBe(60_000);
	});
});

describe("UploadQueue", () => {
	it("creates the item, uploads the photo and completes it", async () => {
		const { queue, store } = makeQueue();
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: "s-1",
			fields: { name: " Navy jumper ", categoryId: "cat-1" },
		});
		await queue.whenIdle();

		expect(
			backend.calls.map((c) => `${c.method} ${c.url.split("?")[0]}`),
		).toEqual([
			"POST /api/items",
			"POST /api/photos",
			"PUT https://s3.test/photos/photo-1/original",
			"POST /api/photos/photo-1/complete",
		]);
		const [createItem, createPhoto, put] = backend.calls;
		expect(createItem?.body).toEqual({
			locationId: LOCATION,
			sessionId: "s-1",
			name: "Navy jumper",
			categoryId: "cat-1",
		});
		expect(createItem?.headers.get("idempotency-key")).toBe(`item-${job.id}`);
		expect(createPhoto?.body).toEqual({
			itemId: "item-1",
			kind: "main",
			contentType: "image/jpeg",
			size: 10,
		});
		expect(put?.headers.get("content-type")).toBe("image/jpeg");
		expect(await (put?.body as Blob | undefined)?.text()).toBe("jpeg-bytes");

		const done = queue.get(job.id);
		expect(done).toMatchObject({
			status: "done",
			itemId: "item-1",
			photoId: "photo-1",
			error: null,
		});
		expect(done?.photo?.status).toBe("processing");
		expect(done?.preview).toBeInstanceOf(Blob);
		// Large blobs are dropped once uploaded; the job record stays.
		expect(await store.getBlob(job.id, "upload")).toBeUndefined();
		expect(await store.getBlob(job.id, "original")).toBeUndefined();
		expect((await store.loadJobs()).map((j) => j.status)).toEqual(["done"]);
	});

	it("persists the capture before anything is uploaded", async () => {
		const gate = deferred<Response>();
		backend.use((c) => (c.url === "/api/items" ? gate.promise : undefined));
		const { queue, store } = makeQueue();
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		const [stored] = await store.loadJobs();
		expect(stored?.id).toBe(job.id);
		gate.resolve(json(itemDto("item-x"), 201));
		await queue.whenIdle();
		expect(queue.get(job.id)?.status).toBe("done");
	});

	it("retries transient failures with backoff without redoing finished steps", async () => {
		let failures = 2;
		backend.use((c) =>
			c.url === "/api/photos" && failures-- > 0
				? json({ error: "internal", message: "boom" }, 503)
				: undefined,
		);
		const { queue } = makeQueue();
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await queue.whenIdle();

		const retrying = queue.get(job.id);
		expect(retrying).toMatchObject({
			status: "retrying",
			attempts: 1,
			error: "boom",
		});
		expect(retrying?.nextAttemptAt).toBe(Date.now() + 1000);

		await vi.advanceTimersByTimeAsync(999);
		expect(backend.find("POST", "/api/photos")).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		await queue.whenIdle();
		expect(queue.get(job.id)).toMatchObject({
			status: "retrying",
			attempts: 2,
		});

		await vi.advanceTimersByTimeAsync(2000);
		await queue.whenIdle();
		expect(queue.get(job.id)).toMatchObject({ status: "done", attempts: 0 });
		expect(backend.find("POST", "/api/photos")).toHaveLength(3);
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
		expect(fakePrepare).toHaveBeenCalledTimes(1);
	});

	it("gives up after maxAttempts network errors, and retry() starts again", async () => {
		let offline = true;
		backend.use((c) => {
			if (offline && c.method === "PUT") throw new TypeError("Load failed");
			return undefined;
		});
		const { queue } = makeQueue({ maxAttempts: 3 });
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await queue.whenIdle();
		await vi.advanceTimersByTimeAsync(1000);
		await queue.whenIdle();
		await vi.advanceTimersByTimeAsync(2000);
		await queue.whenIdle();

		expect(queue.get(job.id)).toMatchObject({
			status: "failed",
			attempts: 3,
			nextAttemptAt: null,
			error: "Load failed",
		});
		expect(backend.find("PUT", "https://s3.test/*")).toHaveLength(3);

		offline = false;
		await queue.retry(job.id);
		await queue.whenIdle();
		expect(queue.get(job.id)?.status).toBe("done");
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
	});

	it("fails permanently on a validation error", async () => {
		backend.use((c) =>
			c.url === "/api/items"
				? json({ error: "unprocessable", message: "Location is archived" }, 422)
				: undefined,
		);
		const { queue } = makeQueue();
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await queue.whenIdle();
		expect(queue.get(job.id)).toMatchObject({
			status: "failed",
			error: "Location is archived",
			nextAttemptAt: null,
		});
		await vi.advanceTimersByTimeAsync(120_000);
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
	});

	it("resumes after a reload at the step that was interrupted", async () => {
		// The first POST /api/photos never answers (the page is killed meanwhile).
		let hung = false;
		backend.use((c) => {
			if (c.url !== "/api/photos" || hung) return undefined;
			hung = true;
			return new Promise<Response>(() => {});
		});
		const first = makeQueue();
		await first.queue.start();
		const job = await first.queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: "s-1",
		});
		await vi.waitFor(() =>
			expect(backend.find("POST", "/api/photos")).toHaveLength(1),
		);
		// The page dies here: the job was "running" with its item created.
		first.queue.dispose();

		const persisted = await first.store.loadJobs();
		expect(persisted[0]).toMatchObject({ status: "running", itemId: "item-1" });

		const second = makeQueue({ storeName: first.storeName });
		await second.queue.start();
		await second.queue.whenIdle();
		expect(second.queue.get(job.id)).toMatchObject({
			status: "done",
			itemId: "item-1",
			sessionId: "s-1",
		});
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
		expect(fakePrepare).toHaveBeenCalledTimes(1);
	});

	it("runs at most two jobs at a time", async () => {
		const gates: ReturnType<typeof deferred<void>>[] = [];
		backend.use(async (c) => {
			if (c.method === "PUT") {
				const gate = deferred();
				gates.push(gate);
				await gate.promise;
			}
			return undefined;
		});
		const { queue } = makeQueue();
		await queue.start();
		for (let i = 0; i < 5; i++) {
			await queue.enqueueCapture({
				blob: photo(),
				locationId: LOCATION,
				sessionId: null,
			});
		}
		await vi.waitFor(() => expect(gates).toHaveLength(2));
		const running = () =>
			queue.getSnapshot().jobs.filter((j) => j.status === "running");
		expect(running()).toHaveLength(2);
		expect(backend.maxInFlight).toBe(2);

		for (let released = 0; released < 5; released++) {
			await vi.waitFor(() => expect(gates.length).toBeGreaterThan(released));
			expect(running().length).toBeLessThanOrEqual(2);
			gates[released]?.resolve();
		}
		await queue.whenIdle();
		expect(queue.getSnapshot().jobs.every((j) => j.status === "done")).toBe(
			true,
		);
		expect(backend.maxInFlight).toBe(2);
		expect(backend.find("POST", "/api/items")).toHaveLength(5);
	});

	it("uploads a label photo once its capture's item exists", async () => {
		const itemGate = deferred<Response>();
		backend.use((c) => (c.url === "/api/items" ? itemGate.promise : undefined));
		const { queue } = makeQueue();
		await queue.start();
		const main = await queue.enqueueCapture({
			blob: photo("main"),
			locationId: LOCATION,
			sessionId: null,
		});
		const label = await queue.enqueueExtraPhoto({
			blob: photo("label"),
			parentJobId: main.id,
		});
		await vi.waitFor(() => expect(queue.get(label.id)?.prepared).toBe(true));
		await vi.waitFor(() => expect(queue.get(label.id)?.status).toBe("queued"));
		expect(backend.find("POST", "/api/photos")).toHaveLength(0);

		itemGate.resolve(json(itemDto("item-9"), 201));
		await queue.whenIdle();
		const labelPhoto = backend
			.find("POST", "/api/photos")
			.find((c) => (c.body as { kind: string }).kind === "label");
		expect(labelPhoto?.body).toMatchObject({ itemId: "item-9", kind: "label" });
		expect(queue.get(label.id)).toMatchObject({
			status: "done",
			itemId: "item-9",
		});
	});

	it("sends quick-field edits with the create, and PATCHes later edits", async () => {
		const itemGate = deferred<Response>();
		backend.use((c) => (c.url === "/api/items" ? itemGate.promise : undefined));
		const { queue } = makeQueue();
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await vi.waitFor(() =>
			expect(backend.find("POST", "/api/items")).toHaveLength(1),
		);
		// Edited while the create is in flight: must not be lost.
		await queue.updateFields(job.id, { name: "Scarf" });
		itemGate.resolve(json(itemDto("item-1"), 201));
		await queue.whenIdle();
		expect(
			backend.find("PATCH", "/api/items/item-1").map((c) => c.body),
		).toEqual([{ name: "Scarf", categoryId: null }]);
		expect(queue.get(job.id)?.status).toBe("done");

		await queue.updateFields(job.id, { categoryId: "cat-2" });
		await queue.whenIdle();
		expect(
			backend.find("PATCH", "/api/items/item-1").map((c) => c.body),
		).toEqual([
			{ name: "Scarf", categoryId: null },
			{ name: "Scarf", categoryId: "cat-2" },
		]);
		expect(queue.get(job.id)).toMatchObject({
			status: "done",
			fieldsVersion: 2,
			syncedFieldsVersion: 2,
		});
	});

	it("requests a new upload URL when the presigned one has expired", async () => {
		let expired = true;
		backend.use((c) => {
			if (c.method === "PUT" && expired) {
				expired = false;
				return new Response("<Error>Request has expired</Error>", {
					status: 403,
				});
			}
			return undefined;
		});
		const { queue } = makeQueue();
		await queue.start();
		const job = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await queue.whenIdle();
		expect(queue.get(job.id)).toMatchObject({
			status: "retrying",
			photoId: null,
		});
		await vi.advanceTimersByTimeAsync(1000);
		await queue.whenIdle();
		expect(queue.get(job.id)).toMatchObject({
			status: "done",
			photoId: "photo-2",
		});
		expect(backend.find("POST", "/api/photos/photo-2/complete")).toHaveLength(
			1,
		);
	});

	it("pauses on an expired sign-in and resumes on kick()", async () => {
		let signedIn = false;
		backend.use((c) =>
			!signedIn && c.url.startsWith("/api/")
				? json({ error: "unauthorized", message: "Not signed in" }, 401)
				: undefined,
		);
		const { queue } = makeQueue();
		await queue.start();
		const a = await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: null,
		});
		await queue.whenIdle();
		expect(queue.getSnapshot().authRequired).toBe(true);
		expect(queue.get(a.id)).toMatchObject({ status: "queued", attempts: 0 });
		const attempted = backend.find("POST", "/api/items").length;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(backend.find("POST", "/api/items")).toHaveLength(attempted);

		signedIn = true;
		queue.kick();
		await queue.whenIdle();
		expect(queue.getSnapshot().authRequired).toBe(false);
		expect(queue.getSnapshot().jobs.map((j) => j.status)).toEqual([
			"done",
			"done",
		]);
	});

	it("kick() runs a backing-off job immediately (back online)", async () => {
		let offline = true;
		backend.use(() => {
			if (offline)
				throw new TypeError("The Internet connection appears to be offline.");
			return undefined;
		});
		const { queue } = makeQueue();
		await queue.start();
		for (let i = 0; i < 4; i++) {
			const job = await queue.enqueueCapture({
				blob: photo(),
				locationId: LOCATION,
				sessionId: null,
			});
			await queue.whenIdle();
			if (i === 0) expect(queue.get(job.id)?.status).toBe("retrying");
		}
		offline = false;
		queue.kick();
		await queue.whenIdle();
		expect(queue.getSnapshot().jobs.every((j) => j.status === "done")).toBe(
			true,
		);
	});

	it("forgets a session's finished captures", async () => {
		const { queue, store } = makeQueue();
		await queue.start();
		await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: "s-1",
		});
		await queue.enqueueCapture({
			blob: photo(),
			locationId: LOCATION,
			sessionId: "s-2",
		});
		await queue.whenIdle();
		await queue.forgetFinished("s-1");
		expect(queue.getSnapshot().jobs.map((j) => j.sessionId)).toEqual(["s-2"]);
		expect((await store.loadJobs()).map((j) => j.sessionId)).toEqual(["s-2"]);
	});
});
