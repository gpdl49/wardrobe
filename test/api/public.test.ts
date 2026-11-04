import { beforeEach, describe, expect, it } from "vitest";
import { GET as healthz } from "@/app/api/healthz/route";
import { GET as me } from "@/app/api/me/route";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { apiRequest, json, TEST_USER } from "@/test/helpers/http";
import { ADMIN_USER } from "@/test/helpers/users";

// Rejected requests never reach the database; signed-in ones get a users row.

describe("GET /api/healthz", () => {
	it("returns ok without auth", async () => {
		const response = healthz();
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});
});

describeWithDb("GET /api/me signed in", () => {
	beforeEach(async () => {
		await resetDb();
	});

	it("returns the proxy user with their id", async () => {
		const response = await me(apiRequest("/api/me"), {});
		expect(response.status).toBe(200);
		const row = await db().user.findUniqueOrThrow({
			where: { sub: TEST_USER.sub },
		});
		expect(await json(response)).toEqual({
			...TEST_USER,
			id: row.id,
			isAdmin: false,
		});
	});

	it("marks members of ADMIN_GROUP as admins", async () => {
		const response = await me(apiRequest("/api/me", { user: ADMIN_USER }), {});
		expect(await json(response)).toMatchObject({
			sub: ADMIN_USER.sub,
			isAdmin: true,
		});
	});

	it("keeps one row per user and follows email changes", async () => {
		const first = await json<{ id: string }>(
			await me(apiRequest("/api/me"), {}),
		);
		const renamed = { ...TEST_USER, email: "new@example.com" };
		const second = await json<{ id: string; email: string }>(
			await me(apiRequest("/api/me", { user: renamed }), {}),
		);
		expect(second.id).toBe(first.id);
		expect(second.email).toBe("new@example.com");
		expect(await db().user.count()).toBe(1);
	});
});

describe("GET /api/me rejected", () => {
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
