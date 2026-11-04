import { describe, expect, it } from "vitest";
import {
	authenticate,
	devUser,
	parseGroups,
	parseProxyHeaders,
} from "@/lib/auth";
import { ApiError } from "@/lib/http/errors";

const proxy = {
	AUTH_MODE: "proxy",
	REQUIRED_GROUP: "wardrobe",
	ADMIN_GROUP: "wardrobe-admin",
	NODE_ENV: "production",
} as const;

const headers = (h: Record<string, string>) => new Headers(h);

function statusOf(fn: () => unknown): number | undefined {
	try {
		fn();
	} catch (err) {
		return err instanceof ApiError ? err.status : -1;
	}
	return undefined;
}

describe("parseGroups", () => {
	it("splits, trims and de-duplicates", () => {
		expect(parseGroups(" wardrobe, admin ,,wardrobe")).toEqual([
			"wardrobe",
			"admin",
		]);
	});

	it("returns [] for a missing or empty header", () => {
		expect(parseGroups(null)).toEqual([]);
		expect(parseGroups("")).toEqual([]);
	});
});

describe("parseProxyHeaders", () => {
	it("reads every oauth2-proxy header", () => {
		expect(
			parseProxyHeaders(
				headers({
					"X-Forwarded-User": "312345678901234567",
					"X-Forwarded-Email": "vidur@example.com",
					"X-Forwarded-Preferred-Username": "vidur",
					"X-Forwarded-Groups": "wardrobe,homestacks:admin",
				}),
			),
		).toEqual({
			sub: "312345678901234567",
			email: "vidur@example.com",
			username: "vidur",
			groups: ["wardrobe", "homestacks:admin"],
		});
	});

	it("returns null without X-Forwarded-User (or with a blank one)", () => {
		expect(
			parseProxyHeaders(headers({ "X-Forwarded-Email": "a@b" })),
		).toBeNull();
		expect(parseProxyHeaders(headers({ "X-Forwarded-User": "  " }))).toBeNull();
	});

	it("leaves optional headers null", () => {
		expect(parseProxyHeaders(headers({ "X-Forwarded-User": "sub" }))).toEqual({
			sub: "sub",
			email: null,
			username: null,
			groups: [],
		});
	});
});

describe("authenticate", () => {
	it("401s without a user", () => {
		expect(statusOf(() => authenticate(headers({}), proxy))).toBe(401);
	});

	it("403s without the required group", () => {
		expect(
			statusOf(() =>
				authenticate(
					headers({ "X-Forwarded-User": "sub", "X-Forwarded-Groups": "other" }),
					proxy,
				),
			),
		).toBe(403);
	});

	it("does not match the group by substring", () => {
		expect(
			statusOf(() =>
				authenticate(
					headers({
						"X-Forwarded-User": "sub",
						"X-Forwarded-Groups": "wardrobe-admins",
					}),
					proxy,
				),
			),
		).toBe(403);
	});

	it("returns the user with the required group", () => {
		const user = authenticate(
			headers({
				"X-Forwarded-User": "sub",
				"X-Forwarded-Groups": "a,wardrobe",
			}),
			proxy,
		);
		expect(user.sub).toBe("sub");
	});

	it("ignores headers in dev mode", () => {
		expect(
			authenticate(headers({}), {
				...proxy,
				AUTH_MODE: "dev",
				NODE_ENV: "development",
			}),
		).toEqual(devUser("wardrobe", "wardrobe-admin"));
	});

	it("refuses dev mode in production", () => {
		expect(() =>
			authenticate(headers({}), { ...proxy, AUTH_MODE: "dev" }),
		).toThrow(/refused/);
	});
});
