import { vi } from "vitest";
import type { ItemSummaryDto, PhotoDto, PhotoUploadDto } from "@/lib/api/types";
import { UploadQueue } from "@/lib/client/upload/queue";
import type { Prepared } from "@/lib/client/upload/resize";
import { createIdbStore } from "@/lib/client/upload/store";

/**
 * Test doubles for the upload queue: an in-memory fake of the wardrobe API
 * and S3 behind a mocked `fetch`, and a queue on fake IndexedDB. Import
 * "fake-indexeddb/auto" in the test file first.
 */

export type Call = {
	method: string;
	url: string;
	body: unknown;
	headers: Headers;
};

type Handler = (
	call: Call,
) => Response | undefined | Promise<Response | undefined>;

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export function photoDto(
	id: string,
	overrides: Partial<PhotoDto> = {},
): PhotoDto {
	return {
		id,
		ownerId: "owner-1",
		access: "owner",
		itemId: null,
		outfitId: null,
		kind: "main",
		status: "pending",
		contentType: "image/jpeg",
		size: 4,
		width: null,
		height: null,
		blurhash: null,
		createdAt: "2026-11-03T00:00:00.000Z",
		urls: {
			original: `/api/photos/${id}/original`,
			display: `/api/photos/${id}/display`,
			thumb: `/api/photos/${id}/thumb`,
		},
		...overrides,
	};
}

export function itemDto(
	id: string,
	overrides: Partial<ItemSummaryDto> = {},
): ItemSummaryDto {
	return {
		id,
		ownerId: "owner-1",
		access: "owner",
		name: null,
		category: null,
		brand: null,
		size: null,
		colors: [],
		pattern: null,
		material: null,
		seasons: [],
		status: "stored",
		location: null,
		notes: null,
		tags: [],
		coverPhoto: null,
		createdAt: "2026-11-03T00:00:00.000Z",
		updatedAt: "2026-11-03T00:00:00.000Z",
		...overrides,
	};
}

/**
 * A fake backend. `override` handlers run first; returning undefined falls
 * through to the default happy-path behaviour.
 */
export function fakeBackend() {
	const calls: Call[] = [];
	const overrides: Handler[] = [];
	let items = 0;
	let photos = 0;
	let inFlight = 0;
	let maxInFlight = 0;

	const fetchMock = vi.fn(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			const raw = init?.body;
			const body =
				typeof raw === "string"
					? JSON.parse(raw)
					: raw instanceof Blob
						? raw
						: undefined;
			const call: Call = {
				method,
				url,
				body,
				headers: new Headers(init?.headers),
			};
			calls.push(call);
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				for (const handler of overrides) {
					const response = await handler(call);
					if (response) return response;
				}
				return defaults(call);
			} finally {
				inFlight -= 1;
			}
		},
	);

	function defaults(call: Call): Response {
		if (call.method === "POST" && call.url === "/api/items") {
			items += 1;
			return json(
				itemDto(`item-${items}`, call.body as Partial<ItemSummaryDto>),
				201,
			);
		}
		if (call.method === "PATCH" && call.url.startsWith("/api/items/")) {
			return json(itemDto(call.url.split("/").pop() ?? ""));
		}
		if (call.method === "POST" && call.url === "/api/photos") {
			photos += 1;
			const id = `photo-${photos}`;
			const upload: PhotoUploadDto = {
				photo: photoDto(id),
				uploadUrl: `https://s3.test/photos/${id}/original?sig=${photos}`,
				uploadHeaders: { "content-type": "image/jpeg" },
			};
			return json(upload, 201);
		}
		if (call.method === "PUT" && call.url.startsWith("https://s3.test/")) {
			return new Response(null, { status: 200 });
		}
		const complete = /^\/api\/photos\/([^/]+)\/complete$/.exec(call.url);
		if (call.method === "POST" && complete?.[1]) {
			return json(photoDto(complete[1], { status: "processing" }));
		}
		return json(
			{ error: "not_found", message: `${call.method} ${call.url}` },
			404,
		);
	}

	return {
		fetch: fetchMock,
		calls,
		/** Calls with this method and URL (ignoring the query); `*` suffix = prefix. */
		find: (method: string, url: string) =>
			calls.filter(
				(c) =>
					c.method === method &&
					(url.endsWith("*")
						? c.url.startsWith(url.slice(0, -1))
						: c.url.split("?")[0] === url),
			),
		use(handler: Handler) {
			overrides.push(handler);
		},
		get maxInFlight() {
			return maxInFlight;
		},
	};
}

/**
 * Stands in for the canvas downscale. Ignores the input's bytes: under jsdom,
 * Blobs that went through fake IndexedDB lose their methods.
 */
export const fakePrepare = vi.fn(
	async (_blob: Blob): Promise<Prepared> => ({
		upload: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
		preview: new Blob(["preview"], { type: "image/jpeg" }),
	}),
);

let dbCounter = 0;

/** A queue on a fresh fake IndexedDB (or `storeName` to share one). */
export function makeQueue(
	options: {
		storeName?: string;
		maxAttempts?: number;
		concurrency?: number;
	} = {},
) {
	const storeName = options.storeName ?? `test-${++dbCounter}`;
	let ids = 0;
	const store = createIdbStore(storeName);
	const queue = new UploadQueue({
		store,
		prepare: fakePrepare,
		concurrency: options.concurrency,
		maxAttempts: options.maxAttempts,
		random: () => 1,
		newId: () => `${storeName}-job-${++ids}`,
	});
	return { queue, store, storeName };
}

export function photo(text = "jpeg-bytes"): Blob {
	return new Blob([text], { type: "image/jpeg" });
}

/** A promise you resolve from the outside. */
export function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
