import { describe, expect, it } from "vitest";
import {
	deltaE2000,
	hexToLab,
	labToHex,
	rgbToLab,
} from "@/lib/analyses/color-space";
import { nameColor, PALETTE } from "@/lib/analyses/palette";

describe("color space", () => {
	it("converts sRGB to CIELAB (D65)", () => {
		const white = rgbToLab(255, 255, 255);
		expect(white[0]).toBeCloseTo(100, 1);
		expect(white[1]).toBeCloseTo(0, 1);
		expect(white[2]).toBeCloseTo(0, 1);
		const red = rgbToLab(255, 0, 0);
		expect(red[0]).toBeCloseTo(53.24, 1);
		expect(red[1]).toBeCloseTo(80.09, 1);
		expect(red[2]).toBeCloseTo(67.2, 1);
	});

	it("round-trips hex through Lab", () => {
		for (const { hex } of PALETTE) {
			expect(labToHex(hexToLab(hex))).toBe(hex);
		}
	});

	it("computes CIEDE2000 (Sharma et al. test data)", () => {
		expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(
			2.0425,
			3,
		);
		expect(deltaE2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 3);
		expect(deltaE2000([50, 0, 0], [50, 0, 0])).toBe(0);
	});
});

describe("palette", () => {
	it("has unique names and #rrggbb hexes", () => {
		const names = PALETTE.map((p) => p.name);
		expect(new Set(names).size).toBe(names.length);
		expect(PALETTE.length).toBeGreaterThanOrEqual(30);
		expect(PALETTE.length).toBeLessThanOrEqual(40);
		for (const { hex } of PALETTE) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("names every palette swatch as itself", () => {
		for (const { name, hex } of PALETTE) expect(nameColor(hex)).toBe(name);
	});

	it.each([
		["#000080", "navy"],
		["#1a1f2e", "navy"],
		["#000000", "black"],
		["#ffffff", "white"],
		["#fffdd0", "cream"],
		["#808000", "olive"],
		["#800020", "burgundy"],
		["#f5f5dc", "cream"],
		["#c49a66", "tan"],
		["#36454f", "charcoal"],
		["#ff0000", "red"],
		["#8c8c8c", "grey"],
		["#ffc0cb", "pink"],
		["#008080", "teal"],
		["#228b22", "green"],
		["#5d76a9", "denim"],
	])("names %s as %s", (hex, name) => {
		expect(nameColor(hex)).toBe(name);
	});
});
