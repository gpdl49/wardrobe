import { describe, expect, it } from "vitest";
import { GET as healthz } from "@/app/api/healthz/route";
import { GET as me } from "@/app/api/me/route";
import { apiRequest, json, TEST_USER } from "@/test/helpers/http";

// No database needed.

describe("GET /api/healthz", () => {
	it("returns ok without auth", async () => {
		const response = healthz();
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});
});

describe("GET /api/me", () => {
	it("returns the proxy user", async () => {
		const response = await me(apiRequest("/api/me"), {});
		expect(response.status).toBe(200);
		expect(await json(response)).toEqual(TEST_USER);
	});

	it("401s without oauth2-proxy headers", async () => {
		const response = await me(apiRequest("/api/me", { user: null }), {});
		expect(response.status).toBe(401);
		expect(await json(response)).toEqual({
			error: "unauthorized",
			message: "Not signed in",
		});
	});

	it("403s without the wardrobe group", async () => {
		const response = await me(
			apiRequest("/api/me", { user: { ...TEST_USER, groups: ["other"] } }),
			{},
		);
		expect(response.status).toBe(403);
	});
});
