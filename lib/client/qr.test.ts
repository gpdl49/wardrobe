import { describe, expect, it } from "vitest";
import { parseLabel } from "@/lib/client/qr";

describe("parseLabel", () => {
	it.each([
		["https://wardrobe.vidur.xyz/l/B-07", "B-07"],
		["https://wardrobe.vidur.xyz/l/b-07", "B-07"],
		["https://wardrobe.vidur.xyz/l/B-07/", "B-07"],
		["https://wardrobe.vidur.xyz/l/CL-BEDROOM?then=pack", "CL-BEDROOM"],
		["  https://wardrobe.vidur.xyz/l/S-02\n", "S-02"],
		["https://wardrobe.vidur.xyz/l/S%2D02", "S-02"],
		["B-07", "B-07"],
		[" s-02 ", "S-02"],
		["CL-BEDROOM", "CL-BEDROOM"],
	])("accepts %j", (payload, code) => {
		expect(parseLabel(payload)).toBe(code);
	});

	it.each([
		"",
		"   ",
		"https://example.com/l/B-07",
		"https://wardrobe.vidur.xyz.evil.com/l/B-07",
		"https://wardrobe.vidur.xyz/items/B-07",
		"https://wardrobe.vidur.xyz/l/B-07/extra",
		"https://wardrobe.vidur.xyz/l/",
		"https://wardrobe.vidur.xyz/l/B 07",
		"https://wardrobe.vidur.xyz/l/%E0%A4%A",
		"ftp://wardrobe.vidur.xyz/l/B-07",
		"javascript:alert(1)",
		"WIFI:S:home;T:WPA;P:secret;;",
		"B 07",
		"-B07",
		"A".repeat(33),
		"hello world",
	])("rejects %j", (payload) => {
		expect(parseLabel(payload)).toBeNull();
	});

	it("accepts the current origin when asked (dev)", () => {
		expect(parseLabel("http://localhost:3000/l/B-01")).toBeNull();
		expect(parseLabel("http://localhost:3000/l/B-01", ["localhost:3000"])).toBe(
			"B-01",
		);
	});
});
