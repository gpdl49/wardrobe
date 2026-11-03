import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, isApiError, toQueryString } from "./api";

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
