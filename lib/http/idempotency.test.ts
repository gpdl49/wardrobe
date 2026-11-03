import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import {
	hashBody,
	MAX_IDEMPOTENCY_KEY_LENGTH,
	parseIdempotencyKey,
} from "@/lib/http/idempotency";

function codeOf(value: string): string | undefined {
	try {
		parseIdempotencyKey(value);
	} catch (err) {
		return err instanceof ApiError ? `${err.status} ${err.code}` : "other";
	}
	return undefined;
}

describe("parseIdempotencyKey", () => {
	it("returns null without the header", () => {
		expect(parseIdempotencyKey(null)).toBeNull();
	});

	it("accepts printable ASCII up to the limit", () => {
		expect(
			parseIdempotencyKey("item-0190f5a0-0000-7000-8000-000000000000"),
		).toBe("item-0190f5a0-0000-7000-8000-000000000000");
		expect(parseIdempotencyKey("a b~!{}")).toBe("a b~!{}");
		const longest = "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH);
		expect(parseIdempotencyKey(longest)).toBe(longest);
	});

	it("trims surrounding whitespace", () => {
		expect(parseIdempotencyKey("  abc ")).toBe("abc");
	});

	it.each([
		["empty", ""],
		["blank", "   "],
		["too long", "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1)],
		["non-ASCII", "clé"],
		["control character", "a\tb"],
		["DEL", "a\x7fb"],
	])("rejects a %s key with 400 invalid_idempotency_key", (_name, value) => {
		expect(codeOf(value)).toBe("400 invalid_idempotency_key");
	});
});

describe("hashBody", () => {
	it("is a stable SHA-256 hex digest", () => {
		expect(hashBody("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(hashBody('{"a":1}')).not.toBe(hashBody('{"a":2}'));
	});
});
