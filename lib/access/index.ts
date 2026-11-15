import type { Access, ShareAccess } from "@/lib/api/types";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { forbidden, notFound } from "@/lib/http/errors";

/**
 * Who may do what (docs/wardrobe.md, "Access"). Every feature service loads an
 * AccessContext for the caller and goes through these helpers, so the rules
 * live in one place.
 *
 * No access is a 404 (the row might as well not exist); view access on a write
 * is a 403. A location share covers that location, the locations nested in it
 * and the items in them. The strongest applicable grant wins.
 *
 * Outfits (docs/outfits/contract.md): a whole-wardrobe share covers the
 * owner's outfits at its level, an outfit share gives view access to one
 * outfit, and a location share gives none.
 */

export type AccessContext = {
	viewerId: string;
	/** Whole-wardrobe shares by owner id. */
	wardrobes: ReadonlyMap<string, ShareAccess>;
	/** Shared locations, nested ones included, by location id. */
	locations: ReadonlyMap<string, { ownerId: string; access: ShareAccess }>;
	/** Locations shared directly (not just nested in one that is). */
	sharedRoots: ReadonlySet<string>;
	/** Outfits shared directly with the viewer (view access), by outfit id. */
	outfits: ReadonlySet<string>;
};

type ShareRow = {
	ownerId: string;
	access: ShareAccess;
	locationId: string | null;
};

type CoveredLocationRow = {
	id: string;
	ownerId: string;
	access: ShareAccess;
};

const strongest = <T extends Access>(a: T | null, b: T | null): T | null => {
	if (a === "owner" || b === "owner") return "owner" as T;
	if (a === "edit" || b === "edit") return "edit" as T;
	return a ?? b;
};

/** Pure: the context from a viewer's shares and the locations they cover. */
export function buildAccessContext(
	viewerId: string,
	shares: readonly ShareRow[],
	covered: readonly CoveredLocationRow[],
	sharedOutfitIds: readonly string[] = [],
): AccessContext {
	const wardrobes = new Map<string, ShareAccess>();
	const sharedRoots = new Set<string>();
	for (const share of shares) {
		if (share.locationId) {
			sharedRoots.add(share.locationId);
		} else {
			wardrobes.set(share.ownerId, share.access);
		}
	}
	const locations = new Map<string, { ownerId: string; access: ShareAccess }>();
	for (const row of covered) {
		const access =
			strongest<ShareAccess>(
				locations.get(row.id)?.access ?? null,
				row.access,
			) ?? row.access;
		locations.set(row.id, { ownerId: row.ownerId, access });
	}
	return {
		viewerId,
		wardrobes,
		locations,
		sharedRoots,
		outfits: new Set(sharedOutfitIds),
	};
}

/** The caller's shares, expanded down the location tree. */
export async function loadAccess(viewer: {
	id: string;
}): Promise<AccessContext> {
	const [shares, outfitShares] = await Promise.all([
		db().share.findMany({
			where: { granteeId: viewer.id },
			select: { ownerId: true, access: true, locationId: true },
		}),
		db().outfitShare.findMany({
			where: { granteeId: viewer.id },
			select: { outfitId: true },
		}),
	]);
	const sharedOutfitIds = outfitShares.map((share) => share.outfitId);
	if (shares.length === 0) {
		return buildAccessContext(viewer.id, [], [], sharedOutfitIds);
	}
	// UNION (not ALL) drops repeats, so a cycle in the tree cannot loop forever.
	const covered = shares.some((share) => share.locationId)
		? await db().$queryRaw<CoveredLocationRow[]>`
				WITH RECURSIVE tree AS (
					SELECT s.location_id AS id, s.owner_id, s.access::text AS access
					FROM shares s
					WHERE s.grantee_id = ${viewer.id}::uuid AND s.location_id IS NOT NULL
					UNION
					SELECT l.id, tree.owner_id, tree.access
					FROM locations l
					JOIN tree ON l.parent_id = tree.id AND l.owner_id = tree.owner_id
				)
				SELECT id, owner_id AS "ownerId", access FROM tree
			`
		: [];
	return buildAccessContext(viewer.id, shares, covered, sharedOutfitIds);
}

/** Access from ownership or a whole-wardrobe share alone. */
export function accessToWardrobe(
	ctx: AccessContext,
	ownerId: string,
): Access | null {
	if (ownerId === ctx.viewerId) {
		return "owner";
	}
	return ctx.wardrobes.get(ownerId) ?? null;
}

export function accessToLocation(
	ctx: AccessContext,
	location: { id: string; ownerId: string },
): Access | null {
	const shared = ctx.locations.get(location.id);
	return strongest<Access>(
		accessToWardrobe(ctx, location.ownerId),
		shared?.ownerId === location.ownerId ? shared.access : null,
	);
}

export function accessToItem(
	ctx: AccessContext,
	item: { ownerId: string; locationId: string | null },
): Access | null {
	return item.locationId
		? accessToLocation(ctx, { id: item.locationId, ownerId: item.ownerId })
		: accessToWardrobe(ctx, item.ownerId);
}

/**
 * Ownership or a whole-wardrobe share at its level; an outfit share gives
 * view. Location shares do not reach outfits.
 */
export function accessToOutfit(
	ctx: AccessContext,
	outfit: { id: string; ownerId: string },
): Access | null {
	return strongest<Access>(
		accessToWardrobe(ctx, outfit.ownerId),
		ctx.outfits.has(outfit.id) ? "view" : null,
	);
}

/**
 * A photo follows its outfit or its item; an unassigned one its owner (the
 * uploader). The cover photo of an item in a readable outfit is also readable
 * (lib/outfits checks that: it needs a query).
 */
export function accessToPhoto(
	ctx: AccessContext,
	photo: {
		ownerId: string;
		item: { ownerId: string; locationId: string | null } | null;
		outfit?: { id: string; ownerId: string } | null;
	},
): Access | null {
	if (photo.outfit) {
		return accessToOutfit(ctx, photo.outfit);
	}
	return photo.item
		? accessToItem(ctx, photo.item)
		: accessToWardrobe(ctx, photo.ownerId);
}

/**
 * Deleting or re-parenting a location: an owner or whole-wardrobe editor may,
 * and a location editor may for anything nested in their share, but not for
 * the location that was shared with them.
 */
export function canRestructureLocation(
	ctx: AccessContext,
	location: { id: string; ownerId: string },
): boolean {
	const wardrobe = accessToWardrobe(ctx, location.ownerId);
	if (wardrobe === "owner" || wardrobe === "edit") {
		return true;
	}
	return (
		accessToLocation(ctx, location) === "edit" &&
		!ctx.sharedRoots.has(location.id)
	);
}

/** 404 without access; returns it otherwise. */
export function requireRead(access: Access | null, what: string): Access {
	if (!access) {
		throw notFound(`${what} not found`);
	}
	return access;
}

/** 404 without access, 403 with view access. */
export function requireEdit(access: Access | null, what: string): Access {
	const granted = requireRead(access, what);
	if (granted === "view") {
		throw forbidden(`You have view access to this ${what.toLowerCase()}`);
	}
	return granted;
}

const NO_ITEMS: Prisma.ItemWhereInput = { id: { in: [] } };
const NO_LOCATIONS: Prisma.LocationWhereInput = { id: { in: [] } };
const NO_OUTFITS: Prisma.OutfitWhereInput = { id: { in: [] } };

function sharedLocationIds(ctx: AccessContext, ownerId: string): string[] {
	return [...ctx.locations]
		.filter(([, location]) => location.ownerId === ownerId)
		.map(([id]) => id);
}

/** Items in one owner's wardrobe the caller may read. */
export function readableItems(
	ctx: AccessContext,
	ownerId: string = ctx.viewerId,
): Prisma.ItemWhereInput {
	if (accessToWardrobe(ctx, ownerId)) {
		return { ownerId };
	}
	const ids = sharedLocationIds(ctx, ownerId);
	return ids.length > 0 ? { ownerId, locationId: { in: ids } } : NO_ITEMS;
}

/** Locations in one owner's wardrobe the caller may read. */
export function readableLocations(
	ctx: AccessContext,
	ownerId: string = ctx.viewerId,
): Prisma.LocationWhereInput {
	if (accessToWardrobe(ctx, ownerId)) {
		return { ownerId };
	}
	const ids = sharedLocationIds(ctx, ownerId);
	return ids.length > 0 ? { ownerId, id: { in: ids } } : NO_LOCATIONS;
}

/**
 * Outfits in one owner's wardrobe the caller may read: all of them with
 * wardrobe access, otherwise the ones shared with the caller directly.
 */
export function readableOutfits(
	ctx: AccessContext,
	ownerId: string = ctx.viewerId,
): Prisma.OutfitWhereInput {
	if (accessToWardrobe(ctx, ownerId)) {
		return { ownerId };
	}
	return ctx.outfits.size > 0
		? { ownerId, id: { in: [...ctx.outfits] } }
		: NO_OUTFITS;
}
