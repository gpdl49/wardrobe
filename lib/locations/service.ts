import {
	type AccessContext,
	accessToLocation,
	accessToWardrobe,
	canRestructureLocation,
	loadAccess,
	readableLocations,
	requireEdit,
	requireRead,
} from "@/lib/access";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
	conflict,
	forbidden,
	notFound,
	unprocessable,
} from "@/lib/http/errors";
import { itemSummaryInclude, toItemSummaryDto } from "@/lib/items/present";
import type {
	CreateLocationInput,
	ListLocationsQuery,
	UpdateLocationInput,
} from "@/lib/locations/schema";
import { idParam, locationCode } from "@/lib/locations/schema";

/**
 * Locations: data access and rules, kept out of the route handlers so pages
 * and other features can reuse them. Throws ApiErrors; never returns them.
 * Every function takes the caller; lib/access decides what they may do.
 */

type Viewer = { id: string };

const withItemCount = { _count: { select: { items: true } } } as const;

type CountedLocation = Prisma.LocationGetPayload<{
	include: typeof withItemCount;
}>;

const readable = (
	ctx: AccessContext,
	location: { id: string; ownerId: string },
) => accessToLocation(ctx, location) !== null;

/**
 * The API shape. A parent outside the caller's share is hidden, so a location
 * shared on its own does not give away where it is kept.
 */
function present<T extends CountedLocation>(
	ctx: AccessContext,
	{ _count, ...location }: T,
) {
	const parentVisible =
		location.parentId !== null &&
		readable(ctx, { id: location.parentId, ownerId: location.ownerId });
	return {
		...location,
		parentId: parentVisible ? location.parentId : null,
		access: requireRead(accessToLocation(ctx, location), "Location"),
		itemCount: _count.items,
	};
}

export async function listLocations(viewer: Viewer, query: ListLocationsQuery) {
	const ctx = await loadAccess(viewer);
	const where: Prisma.LocationWhereInput = {
		AND: [readableLocations(ctx, query.owner ?? viewer.id)],
	};
	if (query.kind) {
		where.kind = query.kind;
	}
	if (!query.archived) {
		where.archivedAt = null;
	}
	if (query.q) {
		where.OR = [
			{ code: { contains: query.q, mode: "insensitive" } },
			{ name: { contains: query.q, mode: "insensitive" } },
			{ notes: { contains: query.q, mode: "insensitive" } },
		];
	}
	const rows = await db().location.findMany({
		where,
		include: withItemCount,
		orderBy: [{ kind: "asc" }, { code: "asc" }],
	});
	return rows.map((row) => present(ctx, row));
}

/** Path ids that are not UUIDs cannot exist: 404, not 400. */
function parseId(id: string): string {
	const parsed = idParam.safeParse(id);
	if (!parsed.success) {
		throw notFound("Location not found");
	}
	return parsed.data;
}

export async function getLocation(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const location = await db().location.findUnique({
		where: { id: parseId(id) },
		include: {
			...withItemCount,
			items: {
				include: itemSummaryInclude,
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			},
			children: { include: withItemCount, orderBy: { code: "asc" } },
		},
	});
	if (!location || !readable(ctx, location)) {
		throw notFound("Location not found");
	}
	const { items, children, ...rest } = location;
	return {
		...present(ctx, rest),
		items: items.map((item) => toItemSummaryDto(item, ctx)),
		children: children
			.filter((child) => readable(ctx, child))
			.map((child) => present(ctx, child)),
	};
}

/** Looks only in one wardrobe (default the caller's), never across owners. */
export async function getLocationByCode(
	viewer: Viewer,
	code: string,
	ownerId: string = viewer.id,
) {
	const parsed = locationCode.safeParse(code);
	const owner = idParam.safeParse(ownerId);
	const location =
		parsed.success && owner.success
			? await db().location.findUnique({
					where: {
						ownerId_code: { ownerId: owner.data, code: parsed.data },
					},
					include: withItemCount,
				})
			: null;
	const ctx = await loadAccess(viewer);
	if (!location || !readable(ctx, location)) {
		throw notFound("Location not found");
	}
	return present(ctx, location);
}

async function assertCodeFree(
	ownerId: string,
	code: string,
	exceptId?: string,
) {
	const existing = await db().location.findUnique({
		where: { ownerId_code: { ownerId, code } },
		select: { id: true },
	});
	if (existing && existing.id !== exceptId) {
		throw conflict(`Location code ${code} is already in use`);
	}
}

/**
 * The parent must exist in the same wardrobe (a parent the caller cannot see
 * does not exist as far as they are concerned: 422) and they must be able to
 * edit it. Returns its owner.
 */
async function requireEditableParent(ctx: AccessContext, parentId: string) {
	const parent = await db().location.findUnique({
		where: { id: parentId },
		select: { id: true, ownerId: true },
	});
	if (!parent || !readable(ctx, parent)) {
		throw unprocessable("Parent location does not exist");
	}
	requireEdit(accessToLocation(ctx, parent), "Parent location");
	return parent.ownerId;
}

/** The parent must not be the location itself or below it. */
async function assertNoCycle(parentId: string, selfId: string) {
	let cursor: string | null = parentId;
	const seen = new Set<string>();
	while (cursor) {
		if (cursor === selfId) {
			throw unprocessable("A location cannot be inside itself");
		}
		if (seen.has(cursor)) {
			break;
		}
		seen.add(cursor);
		const node: { parentId: string | null } | null =
			await db().location.findUnique({
				where: { id: cursor },
				select: { parentId: true },
			});
		cursor = node?.parentId ?? null;
	}
}

/**
 * A nested location goes in its parent's wardrobe; a top-level one needs
 * ownership or a whole-wardrobe edit share.
 */
export async function createLocation(
	viewer: Viewer,
	input: CreateLocationInput,
) {
	const ctx = await loadAccess(viewer);
	let ownerId = input.ownerId ?? viewer.id;
	if (input.parentId) {
		const parentOwner = await requireEditableParent(ctx, input.parentId);
		if (input.ownerId && input.ownerId !== parentOwner) {
			throw unprocessable("The parent location is in another wardrobe");
		}
		ownerId = parentOwner;
	} else {
		requireEdit(accessToWardrobe(ctx, ownerId), "Wardrobe");
	}
	await assertCodeFree(ownerId, input.code);
	const location = await db().location.create({
		data: {
			ownerId,
			kind: input.kind,
			code: input.code,
			name: input.name,
			notes: input.notes ?? null,
			parentId: input.parentId ?? null,
		},
		include: withItemCount,
	});
	// A new child of a shared location is covered by that share, but the context
	// above was loaded before it existed.
	return present(await loadAccess(viewer), location);
}

/** May the caller take this location to the top level of its wardrobe? */
function assertCanDetach(ctx: AccessContext, ownerId: string) {
	const wardrobe = accessToWardrobe(ctx, ownerId);
	if (wardrobe !== "owner" && wardrobe !== "edit") {
		throw forbidden("Moving a location to the top level needs the wardrobe");
	}
}

export async function updateLocation(
	viewer: Viewer,
	id: string,
	input: UpdateLocationInput,
) {
	const ctx = await loadAccess(viewer);
	const locationId = parseId(id);
	const existing = await db().location.findUnique({
		where: { id: locationId },
		select: { id: true, ownerId: true, parentId: true },
	});
	if (!existing) {
		throw notFound("Location not found");
	}
	requireEdit(accessToLocation(ctx, existing), "Location");
	if (input.code !== undefined) {
		await assertCodeFree(existing.ownerId, input.code, locationId);
	}
	if (input.parentId !== undefined) {
		// Checked before comparing: the shared location's real parent is hidden
		// from its grantee, and the comparison would reveal it.
		if (!canRestructureLocation(ctx, existing)) {
			throw forbidden("You cannot move the location that was shared with you");
		}
	}
	if (input.parentId !== undefined && input.parentId !== existing.parentId) {
		if (input.parentId) {
			const parentOwner = await requireEditableParent(ctx, input.parentId);
			if (parentOwner !== existing.ownerId) {
				throw unprocessable("The parent location is in another wardrobe");
			}
			await assertNoCycle(input.parentId, locationId);
		} else {
			assertCanDetach(ctx, existing.ownerId);
		}
	}
	const location = await db().location.update({
		where: { id: locationId },
		data: {
			kind: input.kind,
			code: input.code,
			name: input.name,
			notes: input.notes,
			parentId: input.parentId,
			archivedAt:
				input.archivedAt === undefined
					? undefined
					: input.archivedAt === null
						? null
						: new Date(input.archivedAt),
		},
		include: withItemCount,
	});
	// Presented with the context from before any move: one that takes the
	// location out of the caller's share still answers with the result.
	return present(ctx, location);
}

/**
 * 409 while items are still in it; child locations are detached. Detaching
 * takes children out of any share they were covered by, and the delete removes
 * shares made on the location itself, so a location editor may only delete one
 * with neither.
 */
export async function deleteLocation(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const locationId = parseId(id);
	const location = await db().location.findUnique({
		where: { id: locationId },
		include: {
			_count: { select: { items: true, children: true, shares: true } },
		},
	});
	if (!location) {
		throw notFound("Location not found");
	}
	requireEdit(accessToLocation(ctx, location), "Location");
	if (!canRestructureLocation(ctx, location)) {
		throw forbidden("You cannot delete the location that was shared with you");
	}
	const wardrobe = accessToWardrobe(ctx, location.ownerId);
	if (
		wardrobe !== "owner" &&
		wardrobe !== "edit" &&
		(location._count.children > 0 || location._count.shares > 0)
	) {
		throw forbidden(
			"Only the owner can delete a location that holds other locations or is shared",
		);
	}
	if (location._count.items > 0) {
		throw conflict(
			`Location ${location.code} still holds ${location._count.items} item(s); move them first`,
		);
	}
	await db().location.delete({ where: { id: locationId } });
}
