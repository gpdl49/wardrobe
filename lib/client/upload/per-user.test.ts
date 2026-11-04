// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activateUploadQueue,
	getUploadQueue,
	uploadStoreName,
} from "@/lib/client/upload";
import {
	fakeBackend,
	makeQueue,
	photo,
} from "@/lib/client/upload/test-helpers";

const capture = () => ({
	blob: photo(),
	sessionId: "s-1",
	locationId: "l-1",
});

let backend: ReturnType<typeof fakeBackend>;

beforeEach(() => {
	backend = fakeBackend();
	vi.stubGlobal("fetch", backend.fetch);
});

afterEach(() => vi.unstubAllGlobals());

describe("per-user upload queues", () => {
	it("gives each user their own queue", () => {
		expect(getUploadQueue("a")).toBe(getUploadQueue("a"));
		expect(getUploadQueue("a")).not.toBe(getUploadQueue("b"));
		expect(uploadStoreName("a")).not.toBe(uploadStoreName("b"));
	});

	it("another user neither sees nor sends the first user's jobs, which resume later", async () => {
		// A signs in, captures, and leaves before anything was sent.
		const a = makeQueue({ storeName: uploadStoreName("user-a-1") });
		await a.queue.start();
		a.queue.pause();
		await a.queue.enqueueCapture(capture());
		expect(backend.calls).toHaveLength(0);

		// B signs in on the same device.
		const b = makeQueue({ storeName: uploadStoreName("user-b-1") });
		await b.queue.start();
		await b.queue.whenIdle();
		expect(b.queue.getSnapshot().jobs).toEqual([]);
		expect(backend.calls).toHaveLength(0);

		// A signs back in (a fresh page load: a new queue on the same store).
		const again = makeQueue({ storeName: uploadStoreName("user-a-1") });
		await again.queue.start();
		expect(again.queue.getSnapshot().jobs).toHaveLength(1);
		await again.queue.whenIdle();
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
		expect(again.queue.getSnapshot().jobs[0]?.status).toBe("done");
	});

	it("a paused queue starts no work until resumed", async () => {
		const { queue } = makeQueue();
		await queue.start();
		queue.pause();
		await queue.enqueueCapture(capture());
		queue.kick();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(backend.calls).toHaveLength(0);

		queue.resume();
		await queue.whenIdle();
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
	});

	it("deactivating pauses the queue; activating resumes it", async () => {
		const { queue } = makeQueue();
		const deactivate = activateUploadQueue(queue);
		await queue.start();
		deactivate();
		await queue.enqueueCapture(capture());
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(backend.calls).toHaveLength(0);

		const again = activateUploadQueue(queue);
		await queue.whenIdle();
		expect(backend.find("POST", "/api/items")).toHaveLength(1);
		again();
	});
});
