import { describe, expect, it } from "vitest";
import {
	descendantIds,
	slugify,
	uniqueSlug,
	wouldCycle,
} from "@/lib/categories/tree";
import { slugify as seedSlugify } from "@/prisma/seed.mjs";

describe("slugify", () => {
	it.each([
		"Dresses & jumpsuits",
		"T-shirts",
		"  Knitwear  ",
		"Ünïcode Things!",
		"---",
	])("matches the seed's slugify for %j", (name) => {
		expect(slugify(name)).toBe(seedSlugify(name));
	});
});

describe("uniqueSlug", () => {
	it("returns the base when free and suffixes it when taken", () => {
		expect(uniqueSlug("shirts", new Set())).toBe("shirts");
		expect(uniqueSlug("shirts", new Set(["shirts"]))).toBe("shirts-2");
		expect(uniqueSlug("shirts", new Set(["shirts", "shirts-2"]))).toBe(
			"shirts-3",
		);
	});

	it("falls back for an empty base and stays within 100 characters", () => {
		expect(uniqueSlug("", new Set())).toBe("category");
		const long = "a".repeat(100);
		const slug = uniqueSlug(long, new Set([long]));
		expect(slug).toHaveLength(100);
		expect(slug.endsWith("-2")).toBe(true);
	});
});

const tree = [
	{ id: "tops", parentId: null },
	{ id: "knit", parentId: "tops" },
	{ id: "cardigan", parentId: "knit" },
	{ id: "shirts", parentId: "tops" },
	{ id: "shoes", parentId: null },
];

describe("descendantIds", () => {
	it("returns the root and everything below it", () => {
		expect(descendantIds(tree, "tops").sort()).toEqual(
			["cardigan", "knit", "shirts", "tops"].sort(),
		);
		expect(descendantIds(tree, "shoes")).toEqual(["shoes"]);
	});

	it("terminates on cyclic data", () => {
		const cyclic = [
			{ id: "a", parentId: "b" },
			{ id: "b", parentId: "a" },
		];
		expect(descendantIds(cyclic, "a").sort()).toEqual(["a", "b"]);
	});
});

describe("wouldCycle", () => {
	it("detects moving a category below itself", () => {
		expect(wouldCycle(tree, "tops", "cardigan")).toBe(true);
		expect(wouldCycle(tree, "knit", "knit")).toBe(true);
		expect(wouldCycle(tree, "knit", "shoes")).toBe(false);
	});
});
