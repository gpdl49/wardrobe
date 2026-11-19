import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http/errors";
import {
	decodeCursor,
	encodeCursor,
	statusForLocationKind,
} from "@/lib/items/rules";

describe("statusForLocationKind", () => {
	it.each([
		["bag", "stored"],
		["vacuum_bag", "stored"],
		["suitcase", "stored"],
		["closet", "active"],
		["drawer", "active"],
		["other", null],
		[null, null],
	] as const)("%s -> %s", (kind, status) => {
		expect(statusForLocationKind(kind)).toBe(status);
	});
});

describe("item cursor", () => {
	it("round-trips", () => {
		const cursor = {
			createdAt: new Date("2026-11-03T10:00:00.123Z"),
			id: "0190f5a0-0000-7000-8000-000000000001",
		};
		const encoded = encodeCursor(cursor);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeCursor(encoded)).toEqual(cursor);
	});

	it.each([
		"garbage",
		Buffer.from("2026-11-03T10:00:00.000Z|nope").toString("base64url"),
		Buffer.from("yesterday|0190f5a0-0000-7000-8000-000000000001").toString(
			"base64url",
		),
	])("rejects %s with a 400", (raw) => {
		expect(() => decodeCursor(raw)).toThrow(ApiError);
		try {
			decodeCursor(raw);
		} catch (err) {
			expect((err as ApiError).status).toBe(400);
		}
	});
});
