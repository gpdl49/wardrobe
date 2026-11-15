import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as aasa } from "@/app/.well-known/apple-app-site-association/route";
import { resetEnvCache } from "@/lib/env";
import { json } from "@/test/helpers/http";

describe("GET /.well-known/apple-app-site-association", () => {
	const originalAppIds = process.env.IOS_APP_IDS;

	beforeEach(() => {
		delete process.env.IOS_APP_IDS;
		resetEnvCache();
	});

	afterEach(() => {
		if (originalAppIds === undefined) {
			delete process.env.IOS_APP_IDS;
		} else {
			process.env.IOS_APP_IDS = originalAppIds;
		}
		resetEnvCache();
	});

	it("returns 404 when IOS_APP_IDS is unset", async () => {
		const response = aasa();
		expect(response.status).toBe(404);
	});

	it("returns 404 when IOS_APP_IDS is empty string", async () => {
		process.env.IOS_APP_IDS = "";
		resetEnvCache();

		const response = aasa();
		expect(response.status).toBe(404);
	});

	it("returns 200 with contract body and headers when IOS_APP_IDS is set", async () => {
		process.env.IOS_APP_IDS = "2J2LYH5QBS.xyz.vidur.wardrobe";
		resetEnvCache();

		const response = aasa();
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");

		const data = await json(response);
		expect(data).toEqual({
			applinks: {
				details: [
					{
						appIDs: ["2J2LYH5QBS.xyz.vidur.wardrobe"],
						components: [{ "/": "/l/*" }],
					},
				],
			},
			webcredentials: {
				apps: ["2J2LYH5QBS.xyz.vidur.wardrobe"],
			},
		});
	});

	it("supports multiple comma-separated app IDs", async () => {
		process.env.IOS_APP_IDS =
			"2J2LYH5QBS.xyz.vidur.wardrobe, 2J2LYH5QBS.xyz.vidur.wardrobe.beta";
		resetEnvCache();

		const response = aasa();
		expect(response.status).toBe(200);

		const data = await json(response);
		expect(data).toEqual({
			applinks: {
				details: [
					{
						appIDs: [
							"2J2LYH5QBS.xyz.vidur.wardrobe",
							"2J2LYH5QBS.xyz.vidur.wardrobe.beta",
						],
						components: [{ "/": "/l/*" }],
					},
				],
			},
			webcredentials: {
				apps: [
					"2J2LYH5QBS.xyz.vidur.wardrobe",
					"2J2LYH5QBS.xyz.vidur.wardrobe.beta",
				],
			},
		});
	});
});
