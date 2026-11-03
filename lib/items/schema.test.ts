import { describe, expect, it } from "vitest";
import {
	createItemSchema,
	listItemsQuery,
	moveItemsSchema,
} from "@/lib/items/schema";
import { tagList } from "@/lib/tags/schema";

describe("tagList", () => {
	it("trims, lower-cases and de-duplicates", () => {
		expect(tagList.parse([" Wool ", "wool", "WORK"])).toEqual(["wool", "work"]);
	});

	it("rejects empty and over-long tags", () => {
		expect(tagList.safeParse(["  "]).success).toBe(false);
		expect(tagList.safeParse(["x".repeat(65)]).success).toBe(false);
		expect(tagList.safeParse(["x".repeat(64)]).success).toBe(true);
	});
});

describe("createItemSchema", () => {
	it("normalises colours and seasons", () => {
		const parsed = createItemSchema.parse({
			colors: [
				{ name: "Navy", hex: "#1F2A44", share: 0.2 },
				{ name: "white", hex: "#ffffff", share: 0.7 },
			],
			seasons: ["winter", "spring", "winter"],
		});
		expect(parsed.colors?.map((c) => c.name)).toEqual(["white", "navy"]);
		expect(parsed.colors?.[1]?.hex).toBe("#1f2a44");
		expect(parsed.seasons).toEqual(["spring", "winter"]);
	});

	it("rejects unknown fields and bad colours", () => {
		expect(createItemSchema.safeParse({ colour: "red" }).success).toBe(false);
		expect(
			createItemSchema.safeParse({
				colors: [{ name: "red", hex: "red", share: 1 }],
			}).success,
		).toBe(false);
	});
});

describe("listItemsQuery", () => {
	it("defaults and bounds the limit", () => {
		expect(listItemsQuery.parse({}).limit).toBe(50);
		expect(listItemsQuery.parse({ limit: "100" }).limit).toBe(100);
		expect(listItemsQuery.safeParse({ limit: "0" }).success).toBe(false);
		expect(listItemsQuery.safeParse({ limit: "101" }).success).toBe(false);
	});
});

describe("moveItemsSchema", () => {
	it("de-duplicates item ids", () => {
		const id = "0190f5a0-0000-7000-8000-000000000001";
		expect(
			moveItemsSchema.parse({ itemIds: [id, id], toLocationId: null }).itemIds,
		).toEqual([id]);
	});
});
