import { describe, expect, it } from "vitest";
import { DEFAULT_VISION_MODEL, EnvError, parseEnv } from "@/lib/env";

const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };

describe("parseEnv", () => {
	it("applies the contract defaults", () => {
		expect(parseEnv(base)).toMatchObject({
			NODE_ENV: "development",
			AUTH_MODE: "proxy",
			REQUIRED_GROUP: "wardrobe",
			AWS_REGION: "eu-central-1",
			PHOTO_BUCKET: "centerpoint-wardrobe-photos",
			OPENROUTER_VISION_MODEL: DEFAULT_VISION_MODEL,
			JOBS_ENABLED: true,
		});
	});

	it("treats empty strings as unset", () => {
		const env = parseEnv({
			...base,
			AUTH_MODE: "",
			S3_ENDPOINT: "",
			OPENROUTER_API_KEY: "",
		});
		expect(env.AUTH_MODE).toBe("proxy");
		expect(env.S3_ENDPOINT).toBeUndefined();
		expect(env.OPENROUTER_API_KEY).toBeUndefined();
	});

	it("requires DATABASE_URL", () => {
		expect(() => parseEnv({})).toThrow(EnvError);
	});

	it("rejects an unknown AUTH_MODE", () => {
		expect(() => parseEnv({ ...base, AUTH_MODE: "none" })).toThrow(/AUTH_MODE/);
	});

	it("refuses AUTH_MODE=dev in production", () => {
		expect(() =>
			parseEnv({ ...base, AUTH_MODE: "dev", NODE_ENV: "production" }),
		).toThrow(/refused when NODE_ENV=production/);
		expect(parseEnv({ ...base, AUTH_MODE: "dev" }).AUTH_MODE).toBe("dev");
	});

	it("validates S3_ENDPOINT as a URL", () => {
		expect(() => parseEnv({ ...base, S3_ENDPOINT: "minio:9000" })).toThrow(
			/S3_ENDPOINT/,
		);
		expect(
			parseEnv({ ...base, S3_ENDPOINT: "http://localhost:9000" }).S3_ENDPOINT,
		).toBe("http://localhost:9000");
	});

	it("needs both AWS keys or neither", () => {
		expect(() => parseEnv({ ...base, AWS_ACCESS_KEY_ID: "x" })).toThrow(
			/AWS_ACCESS_KEY_ID/,
		);
	});

	it("parses JOBS_ENABLED", () => {
		expect(parseEnv({ ...base, JOBS_ENABLED: "false" }).JOBS_ENABLED).toBe(
			false,
		);
	});

	it("lists every problem at once", () => {
		try {
			parseEnv({ AUTH_MODE: "nope" });
			expect.unreachable();
		} catch (err) {
			expect((err as EnvError).issues).toHaveLength(2);
		}
	});
});
