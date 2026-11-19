import { describe, expect, it } from "vitest";
import {
	defaultName,
	kindForCode,
	nextFreeCode,
} from "@/lib/client/location-codes";

describe("nextFreeCode", () => {
	it("starts at 01", () => {
		expect(nextFreeCode([], "bag")).toBe("B-01");
		expect(nextFreeCode(["B-07", "V-02", "S-09"], "vacuum_bag")).toBe("V-03");
		expect(nextFreeCode(["CL-BEDROOM"], "suitcase")).toBe("S-01");
	});

	it("is one past the highest number, ignoring gaps", () => {
		expect(nextFreeCode(["B-01", "B-07", "B-03"], "bag")).toBe("B-08");
	});

	it("only counts its own prefix", () => {
		expect(nextFreeCode(["B-07", "S-02", "BX-99", "B-7A"], "suitcase")).toBe(
			"S-03",
		);
		expect(nextFreeCode(["B-07", "S-02", "BX-99", "B-7A"], "bag")).toBe("B-08");
	});

	it("accepts unpadded and lowercase codes and grows past 99", () => {
		expect(nextFreeCode(["b-9"], "bag")).toBe("B-10");
		expect(nextFreeCode(["B-99"], "bag")).toBe("B-100");
	});
});

describe("kindForCode", () => {
	it.each([
		["B-07", "bag"],
		["v-07", "vacuum_bag"],
		["S-02", "suitcase"],
		["CL-BEDROOM", "closet"],
		["D-3", "drawer"],
		["LOFT", "other"],
		["X-1", "other"],
	])("%s is a %s", (code, kind) => {
		expect(kindForCode(code)).toBe(kind);
	});
});

it("names new containers after their code", () => {
	expect(defaultName("bag", "B-08")).toBe("Bag B-08");
});
