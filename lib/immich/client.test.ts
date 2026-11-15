import { describe, expect, it, vi } from "vitest";
import { ImmichClient } from "./client";

describe("Immich client", () => {
	it("sends the documented search fields and a key header", async () => {
		const fetcher = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				Response.json({ assets: { items: [], nextPage: null } }),
		);
		const client = new ImmichClient(
			"https://immich.example",
			"secret",
			fetcher,
		);
		await client.search(undefined, 2, 20);
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://immich.example/api/search/metadata",
		);
		const init = fetcher.mock.calls[0]?.[1] as RequestInit;
		expect(init.headers).toMatchObject({ "x-api-key": "secret" });
		expect(JSON.parse(init.body as string)).toMatchObject({
			type: "IMAGE",
			page: 2,
			size: 20,
			order: "desc",
		});
		await client.search("blue", 1, 50);
		expect(fetcher.mock.calls[1]?.[0]).toContain("/search/smart");
	});
	it("does not expose fetch errors or keys", async () => {
		const client = new ImmichClient(
			"https://immich.example",
			"secret",
			async () => {
				throw new Error("secret");
			},
		);
		await expect(client.user()).rejects.toThrow("Immich request failed");
	});
});
