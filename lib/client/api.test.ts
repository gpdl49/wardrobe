import { describe, expect, it, vi } from "vitest";
import {
	ApiError,
	createApiClient,
	isApiError,
	isRetryable,
	isSignInExpired,
	toQueryString,
} from "./api";

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function setup(...responses: Response[]) {
	const fetch = vi.fn<typeof globalThis.fetch>();
	for (const response of responses) {
		fetch.mockResolvedValueOnce(response);
	}
	return { fetch, api: createApiClient({ fetch }) };
}

function call(fetch: ReturnType<typeof setup>["fetch"], n = 0) {
	const [url, init] = fetch.mock.calls[n] ?? [];
	return {
		url: String(url),
		method: init?.method,
		body: init?.body ? JSON.parse(String(init.body)) : undefined,
		headers: init?.headers as Record<string, string> | undefined,
	};
}

describe("toQueryString", () => {
	it("drops empty values and encodes the rest", () => {
		expect(
			toQueryString({ q: "red coat", tag: undefined, cursor: "", limit: 48 }),
		).toBe("?q=red+coat&limit=48");
		expect(toQueryString({})).toBe("");
	});
});

describe("api client", () => {
	it("lists items with the filter query", async () => {
		const { fetch, api } = setup(json({ items: [], nextCursor: null }));
		const result = await api.items.list({
			location: "loc-1",
			season: "winter",
			q: "wool",
			cursor: undefined,
			limit: 48,
		});
		expect(result).toEqual({ items: [], nextCursor: null });
		expect(call(fetch)).toMatchObject({
			url: "/api/items?location=loc-1&season=winter&q=wool&limit=48",
			method: "GET",
		});
	});

	it("sends JSON bodies with the right method and path", async () => {
		const { fetch, api } = setup(
			json({ id: "i1" }),
			json({ moved: 2 }),
			json({ id: "i1" }),
		);
		await api.items.update("i1", { name: "Coat", tags: ["wool"] });
		await api.items.move({ itemIds: ["a", "b"], toLocationId: "l2" });
		await api.analyses.apply("i1", "an1", ["brand", "colors"]);

		expect(call(fetch, 0)).toMatchObject({
			url: "/api/items/i1",
			method: "PATCH",
			body: { name: "Coat", tags: ["wool"] },
		});
		expect(call(fetch, 0).headers?.["Content-Type"]).toBe("application/json");
		expect(call(fetch, 1)).toMatchObject({
			url: "/api/items/move",
			method: "POST",
			body: { itemIds: ["a", "b"], toLocationId: "l2" },
		});
		expect(call(fetch, 2)).toMatchObject({
			url: "/api/items/i1/analyses/an1/apply",
			method: "POST",
			body: { fields: ["brand", "colors"] },
		});
	});

	it("encodes path segments", async () => {
		const { fetch, api } = setup(json({ id: "l" }));
		await api.locations.getByCode("B 07/x");
		expect(call(fetch).url).toBe("/api/locations/by-code/B%2007%2Fx");
	});

	it("sends the owner of a by-code lookup and a tag list", async () => {
		const { fetch, api } = setup(json({ id: "l" }));
		await api.locations.getByCode("B-07", { owner: "anna" });
		expect(call(fetch).url).toBe("/api/locations/by-code/B-07?owner=anna");
		const tags = setup(json([]));
		await tags.api.tags.list({ owner: "anna" });
		expect(call(tags.fetch).url).toBe("/api/tags?owner=anna");
	});

	it("talks to the sharing endpoints", async () => {
		const { fetch, api } = setup(json({ id: "s" }));
		await api.shares.create({ grantee: "anna", access: "view" });
		expect(call(fetch)).toMatchObject({
			url: "/api/shares",
			method: "POST",
			body: { grantee: "anna", access: "view" },
		});
		const patch = setup(json({ id: "s" }));
		await patch.api.shares.update("s", "edit");
		expect(call(patch.fetch)).toMatchObject({
			url: "/api/shares/s",
			method: "PATCH",
			body: { access: "edit" },
		});
		const mine = setup(json([]));
		await mine.api.shares.sharedWithMe();
		expect(call(mine.fetch).url).toBe("/api/shared-with-me");
	});

	it("returns undefined for 204", async () => {
		const { api } = setup(new Response(null, { status: 204 }));
		await expect(api.items.delete("i1")).resolves.toBeUndefined();
	});

	it("throws ApiError with the contract body", async () => {
		const { api } = setup(
			json({ error: "conflict", message: "Location still holds items" }, 409),
		);
		const err = await api.locations.delete("l1").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toMatchObject({
			status: 409,
			error: "conflict",
			message: "Location still holds items",
		});
		expect(isApiError(err, 409)).toBe(true);
		expect(isApiError(err, 404)).toBe(false);
	});

	it("falls back to a status code when the body is not the contract shape", async () => {
		const { api } = setup(
			new Response("<html>Bad gateway</html>", {
				status: 502,
				statusText: "Bad Gateway",
			}),
		);
		await expect(api.tags.list()).rejects.toMatchObject({
			status: 502,
			error: "http_error",
			message: "Bad Gateway",
		});
	});

	it("treats an HTML page after a redirect as an expired session", async () => {
		const page = new Response("<html>sign in</html>", {
			status: 200,
			headers: { "content-type": "text/html" },
		});
		Object.defineProperty(page, "redirected", { value: true });
		const { api } = setup(page);
		await expect(api.me()).rejects.toMatchObject({
			status: 401,
			error: "unauthorized",
		});
	});

	it("uploads a photo: create, PUT to S3, complete", async () => {
		const { fetch, api } = setup(
			json(
				{
					photo: { id: "p1" },
					uploadUrl: "https://s3.example/put",
					uploadHeaders: { "Content-Type": "image/jpeg" },
				},
				201,
			),
			new Response(null, { status: 200 }),
			json({ id: "p1", status: "processing" }),
		);
		const file = new Blob(["abc"], { type: "image/jpeg" });
		const photo = await api.photos.upload(file, { itemId: "i1", kind: "main" });

		expect(photo).toEqual({ id: "p1", status: "processing" });
		expect(call(fetch, 0)).toMatchObject({
			url: "/api/photos",
			method: "POST",
			body: { itemId: "i1", kind: "main", contentType: "image/jpeg", size: 3 },
		});
		expect(fetch.mock.calls[1]?.[0]).toBe("https://s3.example/put");
		expect(fetch.mock.calls[1]?.[1]).toMatchObject({
			method: "PUT",
			headers: { "Content-Type": "image/jpeg" },
		});
		expect(call(fetch, 2)).toMatchObject({
			url: "/api/photos/p1/complete",
			method: "POST",
		});
	});

	it("builds photo variant URLs", () => {
		const { api } = setup();
		expect(api.photos.url({ id: "p1" }, "thumb")).toBe("/api/photos/p1/thumb");
	});

	it("uses the global fetch when none is given", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json([]));
		vi.stubGlobal("fetch", fetch);
		try {
			await createApiClient().categories.list();
			expect(fetch).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("idempotency keys", () => {
	it("sends Idempotency-Key on the create calls that take one", async () => {
		const { fetch, api } = setup(
			json({ id: "i1" }, 201),
			json({ photo: { id: "p1" }, uploadUrl: "u", uploadHeaders: {} }, 201),
			json({ id: "s1" }, 201),
		);
		await api.items.create({ locationId: "l1" }, { idempotencyKey: "item-1" });
		await api.photos.create(
			{ kind: "main", contentType: "image/jpeg", size: 3 },
			{ idempotencyKey: "photo-1" },
		);
		await api.sessions.start("pack", "l1", { idempotencyKey: "sess-1" });

		expect(call(fetch, 0)).toMatchObject({
			url: "/api/items",
			method: "POST",
			body: { locationId: "l1" },
		});
		expect(call(fetch, 0).headers?.["Idempotency-Key"]).toBe("item-1");
		expect(call(fetch, 1).headers?.["Idempotency-Key"]).toBe("photo-1");
		expect(call(fetch, 2)).toMatchObject({
			url: "/api/sessions",
			body: { mode: "pack", locationId: "l1" },
		});
		expect(call(fetch, 2).headers?.["Idempotency-Key"]).toBe("sess-1");
	});

	it("sends no Idempotency-Key unless asked", async () => {
		const { fetch, api } = setup(json({ id: "i1" }, 201), json({ id: "s1" }));
		await api.items.create({ locationId: "l1" });
		await api.sessions.start("unpack", "l1");
		expect(call(fetch, 0).headers).not.toHaveProperty("Idempotency-Key");
		expect(call(fetch, 1).headers).not.toHaveProperty("Idempotency-Key");
	});
});

describe("sign-in expiry", () => {
	it("fetches API calls without following redirects", async () => {
		const { fetch, api } = setup(json([]));
		await api.tags.list();
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({
			redirect: "manual",
			credentials: "same-origin",
		});
	});

	it("treats an opaque redirect (browser, redirect: manual) as an expired session", async () => {
		const opaque = {
			type: "opaqueredirect",
			status: 0,
			ok: false,
			redirected: false,
			statusText: "",
			headers: new Headers(),
		} as unknown as Response;
		const { api } = setup(opaque);
		const err = await api.items.list().catch((e: unknown) => e);
		expect(err).toMatchObject({ status: 401, error: "unauthorized" });
		expect(isSignInExpired(err)).toBe(true);
		expect(isRetryable(err)).toBe(false);
	});

	it("treats a bare 3xx (runtimes without opaque redirects) as an expired session", async () => {
		const { api } = setup(
			new Response(null, {
				status: 302,
				headers: { location: "/oauth2/sign_in" },
			}),
		);
		await expect(api.me()).rejects.toMatchObject({
			status: 401,
			error: "unauthorized",
		});
	});

	it("treats a 401 as an expired session", async () => {
		const { api } = setup(
			json({ error: "unauthorized", message: "Not signed in" }, 401),
		);
		const err = await api.me().catch((e: unknown) => e);
		expect(isSignInExpired(err)).toBe(true);
		expect(err).toMatchObject({ message: "Not signed in" });
	});

	it("does not treat other errors as an expired session", () => {
		expect(isSignInExpired(new ApiError(403, "forbidden", "no"))).toBe(false);
		expect(isSignInExpired(new TypeError("Failed to fetch"))).toBe(false);
	});
});

describe("isRetryable", () => {
	const api = (status: number, error = "x") =>
		new ApiError(status, error, "message");

	it("retries network failures, timeouts, throttling and server errors", () => {
		expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
		expect(isRetryable(new DOMException("aborted", "AbortError"))).toBe(true);
		expect(isRetryable(new DOMException("slow", "TimeoutError"))).toBe(true);
		for (const status of [408, 425, 429, 500, 502, 503, 504]) {
			expect(isRetryable(api(status)), String(status)).toBe(true);
		}
	});

	it("retries a 409 idempotency_in_progress, not other conflicts", () => {
		expect(isRetryable(api(409, "idempotency_in_progress"))).toBe(true);
		expect(isRetryable(api(409, "conflict"))).toBe(false);
	});

	it("does not retry other client errors or unknown errors", () => {
		for (const status of [400, 401, 403, 404, 422]) {
			expect(isRetryable(api(status)), String(status)).toBe(false);
		}
		expect(isRetryable(new Error("boom"))).toBe(false);
		expect(isRetryable(new DOMException("nope", "NotAllowedError"))).toBe(
			false,
		);
		expect(isRetryable("string")).toBe(false);
	});
});

describe("photos.put", () => {
	it("PUTs the bytes with exactly the presigned headers", async () => {
		const { fetch, api } = setup(new Response(null, { status: 200 }));
		const file = new Blob(["abc"], { type: "image/jpeg" });
		await api.photos.put(
			"https://s3.example/put?sig=1",
			{ "content-type": "image/jpeg", "x-amz-meta-a": "b" },
			file,
		);
		const [url, init] = fetch.mock.calls[0] ?? [];
		expect(url).toBe("https://s3.example/put?sig=1");
		expect(init).toEqual({
			method: "PUT",
			headers: { "content-type": "image/jpeg", "x-amz-meta-a": "b" },
			body: file,
			signal: undefined,
		});
	});

	it("throws upload_failed with S3's status", async () => {
		const { api } = setup(new Response("<Error/>", { status: 403 }));
		const err = await api.photos
			.put("https://s3.example/put", {}, new Blob(["abc"]))
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toMatchObject({ status: 403, error: "upload_failed" });
		expect(isRetryable(err)).toBe(false);
	});
});
