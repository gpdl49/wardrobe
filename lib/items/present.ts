import {
	type AccessContext,
	accessToItem,
	accessToLocation,
} from "@/lib/access";
import { toAnalysisDto } from "@/lib/analyses/present";
import type {
	CategoryRef,
	ItemColor,
	ItemDetailDto,
	ItemSummaryDto,
	LocationRef,
	MovementDto,
} from "@/lib/api/types";
import type { Prisma } from "@/lib/generated/prisma/client";
import { toPhotoDto } from "@/lib/photos/present";

/**
 * Item serialisation (lib/api/types.ts). Query with these includes and pass
 * the rows to the presenters:
 *
 *   db().item.findMany({ include: itemSummaryInclude })
 *     .then(rows => rows.map(r => toItemSummaryDto(r, ctx)))
 *
 * Only pass rows the caller may read: a row they cannot access throws.
 */

export const locationRefSelect = {
	id: true,
	kind: true,
	code: true,
	name: true,
} as const satisfies Prisma.LocationSelect;

export const categoryRefSelect = {
	id: true,
	name: true,
	slug: true,
} as const satisfies Prisma.CategorySelect;

export const itemSummaryInclude = {
	category: { select: categoryRefSelect },
	location: { select: locationRefSelect },
	tags: { select: { tag: { select: { name: true } } } },
	coverPhoto: true,
} as const satisfies Prisma.ItemInclude;

export const movementInclude = {
	fromLocation: { select: locationRefSelect },
	toLocation: { select: locationRefSelect },
} as const satisfies Prisma.MovementInclude;

export const itemDetailInclude = {
	...itemSummaryInclude,
	photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
	movements: {
		include: movementInclude,
		orderBy: [{ at: "desc" }, { id: "desc" }],
	},
	analyses: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
} as const satisfies Prisma.ItemInclude;

export type ItemSummaryRow = Prisma.ItemGetPayload<{
	include: typeof itemSummaryInclude;
}>;
export type ItemDetailRow = Prisma.ItemGetPayload<{
	include: typeof itemDetailInclude;
}>;
export type MovementRow = Prisma.MovementGetPayload<{
	include: typeof movementInclude;
}>;

export function toLocationRef(
	location: Prisma.LocationGetPayload<{ select: typeof locationRefSelect }>,
): LocationRef {
	return {
		id: location.id,
		kind: location.kind,
		code: location.code,
		name: location.name,
	};
}

function toCategoryRef(
	category: Prisma.CategoryGetPayload<{ select: typeof categoryRefSelect }>,
): CategoryRef {
	return { id: category.id, name: category.name, slug: category.slug };
}

/** Item.colors is free JSON in the database; keep only well-formed entries. */
export function parseColors(value: unknown): ItemColor[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((entry) => {
		if (
			entry &&
			typeof entry === "object" &&
			typeof entry.name === "string" &&
			typeof entry.hex === "string" &&
			typeof entry.share === "number"
		) {
			return [{ name: entry.name, hex: entry.hex, share: entry.share }];
		}
		return [];
	});
}

export function toItemSummaryDto(
	item: ItemSummaryRow,
	ctx: AccessContext,
): ItemSummaryDto {
	const access = accessToItem(ctx, item);
	if (!access) {
		throw new Error(`Item ${item.id} is not readable by ${ctx.viewerId}`);
	}
	return {
		id: item.id,
		ownerId: item.ownerId,
		access,
		name: item.name,
		nameGenerated: item.nameGenerated,
		category: item.category ? toCategoryRef(item.category) : null,
		brand: item.brand,
		size: item.size,
		colors: parseColors(item.colors),
		pattern: item.pattern,
		material: item.material,
		seasons: item.seasons,
		status: item.status,
		location: item.location ? toLocationRef(item.location) : null,
		notes: item.notes,
		tags: item.tags.map((t) => t.tag.name).sort(),
		coverPhoto: item.coverPhoto ? toPhotoDto(item.coverPhoto, access) : null,
		createdAt: item.createdAt.toISOString(),
		updatedAt: item.updatedAt.toISOString(),
	};
}

/**
 * An item can reach someone through a location share after moving there from
 * a location they cannot read. Those references are redacted to null. Movements
 * stay within one owner, so the item's owner is the location's.
 */
export function toMovementDto(
	movement: MovementRow,
	ownerId: string,
	ctx: AccessContext,
): MovementDto {
	const ref = (location: MovementRow["fromLocation"]) =>
		location && accessToLocation(ctx, { id: location.id, ownerId })
			? toLocationRef(location)
			: null;
	return {
		id: movement.id,
		from: ref(movement.fromLocation),
		to: ref(movement.toLocation),
		sessionId: movement.sessionId,
		at: movement.at.toISOString(),
	};
}

export function toItemDetailDto(
	item: ItemDetailRow,
	ctx: AccessContext,
): ItemDetailDto {
	const summary = toItemSummaryDto(item, ctx);
	return {
		...summary,
		photos: item.photos.map((photo) => toPhotoDto(photo, summary.access)),
		movements: item.movements.map((movement) =>
			toMovementDto(movement, item.ownerId, ctx),
		),
		analyses: item.analyses.map(toAnalysisDto),
	};
}
