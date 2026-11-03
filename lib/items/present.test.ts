import { describe, expect, it } from "vitest";
import { parseColors } from "@/lib/items/present";

describe("parseColors", () => {
	it("keeps well-formed entries only", () => {
		expect(
			parseColors([
				{ name: "navy", hex: "#1f2a44", share: 0.6 },
				{ name: "broken" },
				null,
				"red",
			]),
		).toEqual([{ name: "navy", hex: "#1f2a44", share: 0.6 }]);
	});

	it("treats non-arrays as no colours", () => {
		expect(parseColors({})).toEqual([]);
		expect(parseColors(null)).toEqual([]);
	});
});
