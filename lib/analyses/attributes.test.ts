import { describe, expect, it } from "vitest";
import {
	attributeTags,
	GARMENT_ATTRIBUTE_KEYS,
	GARMENT_ATTRIBUTES,
} from "@/lib/analyses/attributes";
import { tagName } from "@/lib/tags/schema";

describe("GARMENT_ATTRIBUTES", () => {
	it("lists only values that are valid, distinct tags", () => {
		const all = GARMENT_ATTRIBUTE_KEYS.flatMap((k) => GARMENT_ATTRIBUTES[k]);
		for (const value of all) {
			expect(tagName.parse(value)).toBe(value);
		}
		expect(new Set(all).size).toBe(all.length);
	});
});

describe("attributeTags", () => {
	it("returns listed values in attribute order and skips nulls", () => {
		expect(
			attributeTags({
				closure: "zip front",
				neckline: null,
				collar: "hooded",
				sleeve: "long sleeve",
			}),
		).toEqual(["hooded", "long sleeve", "zip front"]);
	});

	it("ignores values from another attribute's list and non-objects", () => {
		expect(
			attributeTags({ neckline: "long sleeve", fit: "oversized" }),
		).toEqual(["oversized"]);
		expect(attributeTags(null)).toEqual([]);
		expect(attributeTags("v-neck")).toEqual([]);
	});
});
