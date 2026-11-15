import { describe, expect, it } from "vitest";
import {
	accessToItem,
	accessToLocation,
	accessToOutfit,
	accessToPhoto,
	accessToWardrobe,
	buildAccessContext,
	canRestructureLocation,
	readableItems,
	readableLocations,
	readableOutfits,
	requireEdit,
	requireRead,
} from "@/lib/access";
import { ApiError } from "@/lib/http/errors";

const ME = "me";
const ANNA = "anna";
const BEN = "ben";

const statusOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		return err instanceof ApiError ? err.status : -1;
	}
	return undefined;
};

const none = buildAccessContext(ME, [], []);

/** Anna shares closet (bag nested in it) as edit; Ben his wardrobe as view. */
const ctx = buildAccessContext(
	ME,
	[
		{ ownerId: ANNA, access: "edit", locationId: "closet" },
		{ ownerId: BEN, access: "view", locationId: null },
	],
	[
		{ id: "closet", ownerId: ANNA, access: "edit" },
		{ id: "bag", ownerId: ANNA, access: "edit" },
	],
);

describe("accessToWardrobe", () => {
	it("is owner for your own, the share level for a shared one, else null", () => {
		expect(accessToWardrobe(ctx, ME)).toBe("owner");
		expect(accessToWardrobe(ctx, BEN)).toBe("view");
		expect(accessToWardrobe(ctx, ANNA)).toBeNull();
	});
});

describe("accessToLocation", () => {
	it("covers shared and nested locations only", () => {
		expect(accessToLocation(ctx, { id: "closet", ownerId: ANNA })).toBe("edit");
		expect(accessToLocation(ctx, { id: "bag", ownerId: ANNA })).toBe("edit");
		expect(accessToLocation(ctx, { id: "other", ownerId: ANNA })).toBeNull();
	});

	it("does not trust a location id under a different owner", () => {
		expect(accessToLocation(ctx, { id: "closet", ownerId: "eve" })).toBeNull();
	});

	it("takes the strongest grant", () => {
		const both = buildAccessContext(
			ME,
			[
				{ ownerId: ANNA, access: "view", locationId: null },
				{ ownerId: ANNA, access: "edit", locationId: "closet" },
			],
			[
				{ id: "closet", ownerId: ANNA, access: "edit" },
				{ id: "closet", ownerId: ANNA, access: "view" },
			],
		);
		expect(accessToLocation(both, { id: "closet", ownerId: ANNA })).toBe(
			"edit",
		);
		expect(accessToLocation(both, { id: "other", ownerId: ANNA })).toBe("view");
	});
});

describe("accessToItem", () => {
	it("follows the item's location", () => {
		expect(accessToItem(ctx, { ownerId: ANNA, locationId: "bag" })).toBe(
			"edit",
		);
		expect(accessToItem(ctx, { ownerId: ANNA, locationId: "x" })).toBeNull();
	});

	it("needs the wardrobe for an unplaced item", () => {
		expect(accessToItem(ctx, { ownerId: ANNA, locationId: null })).toBeNull();
		expect(accessToItem(ctx, { ownerId: BEN, locationId: null })).toBe("view");
		expect(accessToItem(ctx, { ownerId: ME, locationId: null })).toBe("owner");
	});
});

describe("accessToPhoto", () => {
	it("follows the item when assigned", () => {
		expect(
			accessToPhoto(ctx, {
				ownerId: ANNA,
				item: { ownerId: ANNA, locationId: "bag" },
			}),
		).toBe("edit");
	});

	it("needs the wardrobe when unassigned", () => {
		expect(accessToPhoto(ctx, { ownerId: ME, item: null })).toBe("owner");
		expect(accessToPhoto(ctx, { ownerId: ANNA, item: null })).toBeNull();
	});
});

describe("canRestructureLocation", () => {
	it("allows owners and whole-wardrobe editors", () => {
		const editor = buildAccessContext(
			ME,
			[{ ownerId: ANNA, access: "edit", locationId: null }],
			[],
		);
		expect(canRestructureLocation(none, { id: "a", ownerId: ME })).toBe(true);
		expect(canRestructureLocation(editor, { id: "a", ownerId: ANNA })).toBe(
			true,
		);
	});

	it("allows nested locations but not the shared one", () => {
		expect(canRestructureLocation(ctx, { id: "bag", ownerId: ANNA })).toBe(
			true,
		);
		expect(canRestructureLocation(ctx, { id: "closet", ownerId: ANNA })).toBe(
			false,
		);
	});

	it("refuses view access and no access", () => {
		expect(canRestructureLocation(ctx, { id: "a", ownerId: BEN })).toBe(false);
		expect(canRestructureLocation(none, { id: "a", ownerId: ANNA })).toBe(
			false,
		);
	});
});

describe("requireRead and requireEdit", () => {
	it("404s without access", () => {
		expect(statusOf(() => requireRead(null, "Item"))).toBe(404);
		expect(statusOf(() => requireEdit(null, "Item"))).toBe(404);
	});

	it("403s a write with view access", () => {
		expect(requireRead("view", "Item")).toBe("view");
		expect(statusOf(() => requireEdit("view", "Item"))).toBe(403);
	});

	it("passes edit and owner", () => {
		expect(requireEdit("edit", "Item")).toBe("edit");
		expect(requireEdit("owner", "Item")).toBe("owner");
	});
});

describe("readableItems and readableLocations", () => {
	it("scopes to the whole wardrobe with wardrobe access", () => {
		expect(readableItems(ctx)).toEqual({ ownerId: ME });
		expect(readableItems(ctx, BEN)).toEqual({ ownerId: BEN });
		expect(readableLocations(ctx, BEN)).toEqual({ ownerId: BEN });
	});

	it("scopes to the covered locations with a location share", () => {
		expect(readableItems(ctx, ANNA)).toEqual({
			ownerId: ANNA,
			locationId: { in: ["closet", "bag"] },
		});
		expect(readableLocations(ctx, ANNA)).toEqual({
			ownerId: ANNA,
			id: { in: ["closet", "bag"] },
		});
	});

	it("matches nothing without access", () => {
		expect(readableItems(ctx, "eve")).toEqual({ id: { in: [] } });
		expect(readableLocations(ctx, "eve")).toEqual({ id: { in: [] } });
	});
});

/** As `ctx`, plus Anna's "wedding" outfit shared directly. */
const withOutfit = buildAccessContext(
	ME,
	[
		{ ownerId: ANNA, access: "edit", locationId: "closet" },
		{ ownerId: BEN, access: "view", locationId: null },
	],
	[{ id: "closet", ownerId: ANNA, access: "edit" }],
	["wedding"],
);

describe("accessToOutfit", () => {
	it("follows ownership and whole-wardrobe shares", () => {
		expect(accessToOutfit(withOutfit, { id: "mine", ownerId: ME })).toBe(
			"owner",
		);
		expect(accessToOutfit(withOutfit, { id: "his", ownerId: BEN })).toBe(
			"view",
		);
	});

	it("gives view on an outfit shared directly, and nothing on the rest", () => {
		expect(accessToOutfit(withOutfit, { id: "wedding", ownerId: ANNA })).toBe(
			"view",
		);
		// The edit share on Anna's closet does not reach her outfits.
		expect(
			accessToOutfit(withOutfit, { id: "office", ownerId: ANNA }),
		).toBeNull();
		expect(accessToOutfit(none, { id: "wedding", ownerId: ANNA })).toBeNull();
	});

	it("keeps the stronger of a wardrobe share and an outfit share", () => {
		const both = buildAccessContext(
			ME,
			[{ ownerId: ANNA, access: "edit", locationId: null }],
			[],
			["wedding"],
		);
		expect(accessToOutfit(both, { id: "wedding", ownerId: ANNA })).toBe("edit");
	});
});

describe("accessToPhoto for outfit photos", () => {
	it("follows the outfit, not the wardrobe", () => {
		expect(
			accessToPhoto(withOutfit, {
				ownerId: ANNA,
				item: null,
				outfit: { id: "wedding", ownerId: ANNA },
			}),
		).toBe("view");
		expect(
			accessToPhoto(withOutfit, {
				ownerId: ANNA,
				item: null,
				outfit: { id: "office", ownerId: ANNA },
			}),
		).toBeNull();
	});
});

describe("readableOutfits", () => {
	it("is the whole wardrobe with wardrobe access", () => {
		expect(readableOutfits(withOutfit)).toEqual({ ownerId: ME });
		expect(readableOutfits(withOutfit, BEN)).toEqual({ ownerId: BEN });
	});

	it("is only the shared outfits otherwise", () => {
		expect(readableOutfits(withOutfit, ANNA)).toEqual({
			ownerId: ANNA,
			id: { in: ["wedding"] },
		});
		expect(readableOutfits(none, ANNA)).toEqual({ id: { in: [] } });
	});
});
