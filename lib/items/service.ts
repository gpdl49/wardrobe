import { z } from "zod";
import {
	type AccessContext,
	accessToItem,
	accessToLocation,
	accessToWardrobe,
	loadAccess,
	readableItems,
	requireEdit,
	requireRead,
} from "@/lib/access";
import type {
	ItemDetailDto,
	ItemListDto,
	ItemStatus,
	ItemSummaryDto,
	LocationKind,
} from "@/lib/api/types";
import type { Viewer } from "@/lib/auth";
import { categoryWithDescendants } from "@/lib/categories/service";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
	conflict,
	forbidden,
	notFound,
	unprocessable,
} from "@/lib/http/errors";
import {
	itemDetailInclude,
	itemSummaryInclude,
	toItemDetailDto,
	toItemSummaryDto,
} from "@/lib/items/present";
import {
	decodeCursor,
	encodeCursor,
	statusForLocationKind,
} from "@/lib/items/rules";
import type {
	CreateItemInput,
	ListItemsQuery,
	MoveItemsInput,
	UpdateItemInput,
} from "@/lib/items/schema";
import { locationCode } from "@/lib/locations/schema";
import { allPhotoKeys, deleteObjects } from "@/lib/s3";
import { ensureTags } from "@/lib/tags/service";

/**
 * Items: data access and rules. Every change of Item.locationId writes a
 * Movement in the same transaction, and applies the status rule in
 * lib/items/rules.ts unless the request sets `status` itself.
 *
 * Access follows lib/access. References in a body that the caller cannot read
 * are a 422, the same as if they did not exist, so nothing is disclosed. Items
 * never change owner: a move stays inside one wardrobe.
 */

type Tx = Prisma.TransactionClient;

const uuid = z.uuid();

function parseId(id: string): string {
	const parsed = uuid.safeParse(id);
	if (!parsed.success) {
		throw notFound("Item not found");
	}
	return parsed.data;
}

/** Matches nothing: a filter value that names no row. */
const NONE: Prisma.ItemWhereInput = { id: { in: [] } };

/** Codes are unique per owner, so a code is looked up in that wardrobe. */
function locationFilter(value: string, ownerId: string): Prisma.ItemWhereInput {
	if (uuid.safeParse(value).success) {
		return { locationId: value };
	}
	const code = locationCode.safeParse(value);
	return code.success ? { location: { ownerId, code: code.data } } : NONE;
}

export async function listItems(
	viewer: Viewer,
	query: ListItemsQuery,
): Promise<ItemListDto> {
	const ctx = await loadAccess(viewer);
	const ownerId = query.owner ?? viewer.id;
	const and: Prisma.ItemWhereInput[] = [readableItems(ctx, ownerId)];
	if (query.location) {
		and.push(locationFilter(query.location, ownerId));
	}
	if (query.category) {
		const ids = await categoryWithDescendants(query.category);
		and.push(ids ? { categoryId: { in: ids } } : NONE);
	}
	if (query.tag) {
		and.push({ tags: { some: { tag: { name: query.tag } } } });
	}
	if (query.season) {
		and.push({ seasons: { has: query.season } });
	}
	if (query.status) {
		and.push({ status: query.status });
	}
	if (query.color) {
		// jsonb @>: some entry of the colors array has this name.
		and.push({ colors: { array_contains: [{ name: query.color }] } });
	}
	if (query.q) {
		const contains = { contains: query.q, mode: "insensitive" } as const;
		and.push({
			OR: [
				{ name: contains },
				{ brand: contains },
				{ notes: contains },
				{ material: contains },
				{
					tags: {
						some: { tag: { name: { contains: query.q.toLowerCase() } } },
					},
				},
			],
		});
	}
	if (query.cursor) {
		const { createdAt, id } = decodeCursor(query.cursor);
		and.push({
			OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
		});
	}
	const rows = await db().item.findMany({
		where: { AND: and },
		include: itemSummaryInclude,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit + 1,
	});
	const page = rows.slice(0, query.limit);
	const last = page.at(-1);
	return {
		items: page.map((item) => toItemSummaryDto(item, ctx)),
		nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
	};
}

export async function getItem(
	viewer: Viewer,
	id: string,
): Promise<ItemDetailDto> {
	const ctx = await loadAccess(viewer);
	const item = await db().item.findUnique({
		where: { id: parseId(id) },
		include: itemDetailInclude,
	});
	if (!item) {
		throw notFound("Item not found");
	}
	requireRead(accessToItem(ctx, item), "Item");
	return toItemDetailDto(item, ctx);
}

async function summary(
	tx: Tx,
	id: string,
	ctx: AccessContext,
): Promise<ItemSummaryDto> {
	return toItemSummaryDto(
		await tx.item.findUniqueOrThrow({
			where: { id },
			include: itemSummaryInclude,
		}),
		ctx,
	);
}

/** A location named in a body: 422 if the caller cannot read it, 403 on view. */
async function editableLocation(tx: Tx, ctx: AccessContext, id: string) {
	const location = await tx.location.findUnique({
		where: { id },
		select: { id: true, ownerId: true, kind: true },
	});
	const access = location && accessToLocation(ctx, location);
	if (!location || !access) {
		throw unprocessable("Location does not exist");
	}
	requireEdit(access, "Location");
	return location;
}

function assertSameOwner(locationOwnerId: string, itemOwnerId: string) {
	if (locationOwnerId !== itemOwnerId) {
		throw unprocessable("An item cannot move between wardrobes");
	}
}

/** Unplacing an item leaves every location share, so it needs the wardrobe. */
function assertCanUnplace(ctx: AccessContext, ownerId: string) {
	const access = accessToWardrobe(ctx, ownerId);
	if (access !== "owner" && access !== "edit") {
		throw forbidden("Only the owner or a wardrobe editor can unplace an item");
	}
}

async function assertCategory(tx: Tx, id: string) {
	const category = await tx.category.findUnique({
		where: { id },
		select: { id: true },
	});
	if (!category) {
		throw unprocessable("Category does not exist");
	}
}

/**
 * The session must exist and be readable (422), be editable (403), belong to
 * the wardrobe of the items it records (422) and still be open (409).
 */
async function assertOpenSession(
	tx: Tx,
	ctx: AccessContext,
	id: string,
	itemOwnerIds: Iterable<string>,
) {
	const session = await tx.packingSession.findUnique({
		where: { id },
		select: { endedAt: true, ownerId: true, locationId: true },
	});
	const access =
		session &&
		accessToLocation(ctx, { id: session.locationId, ownerId: session.ownerId });
	if (!session || !access) {
		throw unprocessable("Packing session does not exist");
	}
	requireEdit(access, "Packing session");
	for (const ownerId of itemOwnerIds) {
		if (ownerId !== session.ownerId) {
			throw unprocessable("The packing session is in another wardrobe");
		}
	}
	if (session.endedAt) {
		throw conflict("Packing session has ended");
	}
}

/** Tags belong to the item's owner, whoever is editing it. */
async function setTags(
	tx: Tx,
	ownerId: string,
	itemId: string,
	names: string[],
) {
	const tagIds = await ensureTags(tx, ownerId, names);
	await tx.itemTag.deleteMany({ where: { itemId } });
	if (tagIds.length > 0) {
		await tx.itemTag.createMany({
			data: tagIds.map((tagId) => ({ itemId, tagId })),
		});
	}
}

/** Plain column values shared by create and update. */
function columns(input: CreateItemInput | UpdateItemInput) {
	return {
		name: input.name,
		categoryId: input.categoryId,
		brand: input.brand,
		size: input.size,
		colors: input.colors,
		pattern: input.pattern,
		material: input.material,
		seasons: input.seasons,
		status: input.status,
		notes: input.notes,
	};
}

export async function createItem(
	viewer: Viewer,
	input: CreateItemInput,
): Promise<ItemSummaryDto> {
	const ctx = await loadAccess(viewer);
	return db().$transaction(async (tx) => {
		if (input.categoryId) {
			await assertCategory(tx, input.categoryId);
		}
		let status: ItemStatus | undefined = input.status;
		let ownerId = input.ownerId ?? viewer.id;
		if (input.locationId) {
			const location = await editableLocation(tx, ctx, input.locationId);
			if (input.ownerId && input.ownerId !== location.ownerId) {
				throw unprocessable("The location is in another wardrobe");
			}
			ownerId = location.ownerId;
			status ??= statusForLocationKind(location.kind) ?? undefined;
		} else {
			requireEdit(accessToWardrobe(ctx, ownerId), "Wardrobe");
		}
		if (input.sessionId) {
			await assertOpenSession(tx, ctx, input.sessionId, [ownerId]);
		}
		const item = await tx.item.create({
			data: {
				...columns(input),
				ownerId,
				status,
				locationId: input.locationId ?? null,
			},
			select: { id: true },
		});
		// Placing a new item somewhere is its first movement.
		if (input.locationId) {
			await tx.movement.create({
				data: {
					itemId: item.id,
					fromLocationId: null,
					toLocationId: input.locationId,
					sessionId: input.sessionId ?? null,
				},
			});
		}
		if (input.tags) {
			await setTags(tx, ownerId, item.id, input.tags);
		}
		return summary(tx, item.id, ctx);
	});
}

export async function updateItem(
	viewer: Viewer,
	id: string,
	input: UpdateItemInput,
): Promise<ItemSummaryDto> {
	const itemId = parseId(id);
	const ctx = await loadAccess(viewer);
	return db().$transaction(async (tx) => {
		const existing = await tx.item.findUnique({
			where: { id: itemId },
			select: { ownerId: true, locationId: true },
		});
		if (!existing) {
			throw notFound("Item not found");
		}
		requireEdit(accessToItem(ctx, existing), "Item");
		if (input.categoryId) {
			await assertCategory(tx, input.categoryId);
		}
		if (input.coverPhotoId) {
			const photo = await tx.photo.findUnique({
				where: { id: input.coverPhotoId },
				select: { itemId: true },
			});
			if (photo?.itemId !== itemId) {
				throw unprocessable("The cover photo must be one of the item's photos");
			}
		}
		let status: ItemStatus | undefined = input.status;
		const moving =
			input.locationId !== undefined &&
			input.locationId !== existing.locationId;
		if (moving) {
			if (input.sessionId) {
				await assertOpenSession(tx, ctx, input.sessionId, [existing.ownerId]);
			}
			let kind: LocationKind | null = null;
			if (input.locationId) {
				const target = await editableLocation(tx, ctx, input.locationId);
				assertSameOwner(target.ownerId, existing.ownerId);
				kind = target.kind;
			} else {
				assertCanUnplace(ctx, existing.ownerId);
			}
			status ??= statusForLocationKind(kind) ?? undefined;
			await tx.movement.create({
				data: {
					itemId,
					fromLocationId: existing.locationId,
					toLocationId: input.locationId ?? null,
					sessionId: input.sessionId ?? null,
				},
			});
		}
		await tx.item.update({
			where: { id: itemId },
			data: {
				...columns(input),
				status,
				locationId: moving ? input.locationId : undefined,
				coverPhotoId: input.coverPhotoId,
			},
		});
		if (input.tags) {
			await setTags(tx, existing.ownerId, itemId, input.tags);
		}
		return summary(tx, itemId, ctx);
	});
}

/**
 * Deletes the item (its photos, tags, movements and analyses cascade), then
 * the photos' S3 objects. The database comes first so a failed delete never
 * leaves rows pointing at missing objects; an S3 failure after that only
 * orphans objects (logged, the request still succeeds).
 */
export async function deleteItem(viewer: Viewer, id: string): Promise<void> {
	const itemId = parseId(id);
	const ctx = await loadAccess(viewer);
	const photos = await db().$transaction(async (tx) => {
		const item = await tx.item.findUnique({
			where: { id: itemId },
			select: {
				ownerId: true,
				locationId: true,
				photos: { select: { id: true } },
			},
		});
		if (!item) {
			throw notFound("Item not found");
		}
		requireEdit(accessToItem(ctx, item), "Item");
		await tx.item.delete({ where: { id: itemId } });
		return item.photos;
	});
	if (photos.length === 0) {
		return;
	}
	try {
		await deleteObjects(photos.flatMap((p) => allPhotoKeys(p.id)));
	} catch (err) {
		console.error(
			`Item ${itemId} deleted but its photo objects were not`,
			photos.map((p) => p.id),
			err,
		);
	}
}

/**
 * Moves items in one transaction. Items already at the target are left alone
 * (no Movement, not counted). Unknown or unreadable items, location or session
 * are a 422; view access to any of them is a 403; an ended session is a 409.
 */
export async function moveItems(
	viewer: Viewer,
	input: MoveItemsInput,
): Promise<{ moved: number }> {
	const ctx = await loadAccess(viewer);
	return db().$transaction(async (tx) => {
		const target = input.toLocationId
			? await editableLocation(tx, ctx, input.toLocationId)
			: null;
		const rows = await tx.item.findMany({
			where: { id: { in: input.itemIds } },
			select: { id: true, ownerId: true, locationId: true },
		});
		const items = rows.filter((item) => accessToItem(ctx, item));
		if (items.length !== input.itemIds.length) {
			const found = new Set(items.map((i) => i.id));
			const missing = input.itemIds.filter((i) => !found.has(i));
			throw unprocessable(`Unknown item(s): ${missing.join(", ")}`);
		}
		for (const item of items) {
			requireEdit(accessToItem(ctx, item), "Item");
			if (target) {
				assertSameOwner(target.ownerId, item.ownerId);
			} else if (item.locationId) {
				assertCanUnplace(ctx, item.ownerId);
			}
		}
		if (input.sessionId) {
			await assertOpenSession(
				tx,
				ctx,
				input.sessionId,
				new Set(items.map((i) => i.ownerId)),
			);
		}
		const changing = items.filter((i) => i.locationId !== input.toLocationId);
		if (changing.length === 0) {
			return { moved: 0 };
		}
		const at = new Date();
		await tx.movement.createMany({
			data: changing.map((item) => ({
				itemId: item.id,
				fromLocationId: item.locationId,
				toLocationId: input.toLocationId,
				sessionId: input.sessionId ?? null,
				at,
			})),
		});
		await tx.item.updateMany({
			where: { id: { in: changing.map((i) => i.id) } },
			data: {
				locationId: input.toLocationId,
				status: statusForLocationKind(target?.kind ?? null) ?? undefined,
			},
		});
		return { moved: changing.length };
	});
}
