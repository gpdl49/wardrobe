import { describe, expect, it } from "vitest";
import { buildAppleAppSiteAssociation } from "@/lib/apple/aasa";
import { EnvError, parseEnv } from "@/lib/env";

const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };

describe("buildAppleAppSiteAssociation", () => {
	it("builds the contract body for a single app ID", () => {
		const doc = buildAppleAppSiteAssociation(["2J2LYH5QBS.xyz.vidur.wardrobe"]);
		expect(doc).toEqual({
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

	it("builds the contract body for multiple app IDs", () => {
		const doc = buildAppleAppSiteAssociation([
			"2J2LYH5QBS.xyz.vidur.wardrobe",
			"2J2LYH5QBS.xyz.vidur.wardrobe.dev",
		]);
		expect(doc).toEqual({
			applinks: {
				details: [
					{
						appIDs: [
							"2J2LYH5QBS.xyz.vidur.wardrobe",
							"2J2LYH5QBS.xyz.vidur.wardrobe.dev",
						],
						components: [{ "/": "/l/*" }],
					},
				],
			},
			webcredentials: {
				apps: [
					"2J2LYH5QBS.xyz.vidur.wardrobe",
					"2J2LYH5QBS.xyz.vidur.wardrobe.dev",
				],
			},
		});
	});
});

describe("parseEnv IOS_APP_IDS", () => {
	it("defaults to undefined when unset or empty", () => {
		expect(parseEnv(base).IOS_APP_IDS).toBeUndefined();
		expect(parseEnv({ ...base, IOS_APP_IDS: "" }).IOS_APP_IDS).toBeUndefined();
	});

	it("parses a single app ID", () => {
		const env = parseEnv({
			...base,
			IOS_APP_IDS: "2J2LYH5QBS.xyz.vidur.wardrobe",
		});
		expect(env.IOS_APP_IDS).toEqual(["2J2LYH5QBS.xyz.vidur.wardrobe"]);
	});

	it("parses comma-separated app IDs and trims whitespace", () => {
		const env = parseEnv({
			...base,
			IOS_APP_IDS:
				" 2J2LYH5QBS.xyz.vidur.wardrobe , 2J2LYH5QBS.xyz.vidur.wardrobe.beta ",
		});
		expect(env.IOS_APP_IDS).toEqual([
			"2J2LYH5QBS.xyz.vidur.wardrobe",
			"2J2LYH5QBS.xyz.vidur.wardrobe.beta",
		]);
	});

	it("rejects an app ID with invalid team prefix", () => {
		expect(() =>
			parseEnv({ ...base, IOS_APP_IDS: "SHORT.xyz.vidur.wardrobe" }),
		).toThrow(EnvError);
		expect(() =>
			parseEnv({ ...base, IOS_APP_IDS: "lowercase1.xyz.vidur.wardrobe" }),
		).toThrow(EnvError);
	});

	it("rejects an app ID without bundle ID or dot separator", () => {
		expect(() =>
			parseEnv({ ...base, IOS_APP_IDS: "2J2LYH5QBSxyzvidurwardrobe" }),
		).toThrow(EnvError);
	});

	it("rejects an empty list of app IDs", () => {
		expect(() => parseEnv({ ...base, IOS_APP_IDS: " , " })).toThrow(EnvError);
	});
});
