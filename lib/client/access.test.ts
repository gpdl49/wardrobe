import { describe, expect, it } from "vitest";
import type { SharedWithMeDto } from "@/lib/api/types";
import { canRestructure, userLabel } from "@/lib/client/access";

const owner = { id: "anna", email: "a@x", username: "anna" };
const share = (
	access: "view" | "edit",
	locationId: string | null,
): SharedWithMeDto => ({
	id: `s-${locationId}`,
	owner,
	access,
	location: locationId ? { id: locationId, code: "B-1", name: "Bag" } : null,
});
const location = (id: string, access: "owner" | "edit" | "view") => ({
	id,
	ownerId: "anna",
	access,
});

describe("canRestructure", () => {
	it("allows the owner", () => {
		expect(canRestructure(location("a", "owner"), [])).toBe(true);
	});

	it("refuses view access", () => {
		expect(canRestructure(location("a", "view"), [share("view", null)])).toBe(
			false,
		);
	});

	it("allows a whole-wardrobe editor, even on a directly shared location", () => {
		expect(
			canRestructure(location("a", "edit"), [
				share("edit", null),
				share("edit", "a"),
			]),
		).toBe(true);
	});

	it("refuses the shared location itself but allows what is nested in it", () => {
		const shares = [share("edit", "closet")];
		expect(canRestructure(location("closet", "edit"), shares)).toBe(false);
		expect(canRestructure(location("bag", "edit"), shares)).toBe(true);
	});
});

describe("userLabel", () => {
	it("prefers the username, then the email", () => {
		expect(userLabel({ username: "anna", email: "a@x" })).toBe("anna");
		expect(userLabel({ username: null, email: "a@x" })).toBe("a@x");
		expect(userLabel({ username: null, email: null })).toBe("Someone");
	});
});
