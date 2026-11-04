import { describe, expect, it } from "vitest";
import { parseLabel } from "@/lib/client/qr";

const OWNER = "019a0000-0000-7000-8000-000000000001";
const label = (path: string) => `https://wardrobe.vidur.xyz/l/${path}`;

describe("parseLabel", () => {
	it.each([
		[label(`${OWNER}/B-07`), "B-07"],
		[label(`${OWNER}/b-07`), "B-07"],
		[label(`${OWNER}/B-07/`), "B-07"],
		[label(`${OWNER}/CL-BEDROOM?then=pack`), "CL-BEDROOM"],
		[`  ${label(`${OWNER}/S-02`)}\n`, "S-02"],
		[label(`${OWNER}/S%2D02`), "S-02"],
		[label(`${OWNER.toUpperCase()}/B-07`), "B-07"],
	])("accepts the label URL %j", (payload, code) => {
		expect(parseLabel(payload)).toEqual({ ownerId: OWNER, code });
	});

	it.each([
		["B-07", "B-07"],
		[" s-02 ", "S-02"],
		["CL-BEDROOM", "CL-BEDROOM"],
	])("takes the bare code %j as the caller's own", (payload, code) => {
		expect(parseLabel(payload)).toEqual({ ownerId: null, code });
	});

	it.each([
		"",
		"   ",
		`https://example.com/l/${OWNER}/B-07`,
		`https://wardrobe.vidur.xyz.evil.com/l/${OWNER}/B-07`,
		`https://wardrobe.vidur.xyz/items/${OWNER}/B-07`,
		label(`${OWNER}/B-07/extra`),
		label(""),
		label(`${OWNER}/`),
		label(`${OWNER}/B 07`),
		label(`${OWNER}/%E0%A4%A`),
		label(`%E0%A4%A/B-07`),
		`ftp://wardrobe.vidur.xyz/l/${OWNER}/B-07`,
		"javascript:alert(1)",
		"WIFI:S:home;T:WPA;P:secret;;",
		"B 07",
		"-B07",
		"A".repeat(33),
		"hello world",
	])("rejects %j", (payload) => {
		expect(parseLabel(payload)).toBeNull();
	});

	it("rejects the old label format without an owner", () => {
		expect(parseLabel(label("B-07"))).toBeNull();
		expect(parseLabel(label("CL-BEDROOM?then=pack"))).toBeNull();
	});

	it.each(["not-a-uuid", "123", "dev", "019a0000-0000-7000-8000-00000000000"])(
		"rejects the malformed owner %j",
		(owner) => {
			expect(parseLabel(label(`${owner}/B-07`))).toBeNull();
		},
	);

	it("accepts the current origin when asked (dev)", () => {
		const url = `http://localhost:3000/l/${OWNER}/B-01`;
		expect(parseLabel(url)).toBeNull();
		expect(parseLabel(url, ["localhost:3000"])).toEqual({
			ownerId: OWNER,
			code: "B-01",
		});
	});
});
