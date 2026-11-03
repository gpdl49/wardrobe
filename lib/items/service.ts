import { z } from "zod";
import type {
	ItemDetailDto,
	ItemListDto,
	ItemStatus,
	ItemSummaryDto,
	LocationKind,
} from "@/lib/api/types";
import { categoryWithDescendants } from "@/lib/categories/service";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { conflict, notFound, unprocessable } from "@/lib/http/errors";
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

async function locationFilter(value: string): Promise<Prisma.ItemWhereInput> {
	if (uuid.safeParse(value).success) {
		return { locationId: value };
	}
	const code = locationCode.safeParse(value);
	return code.success ? { location: { code: code.data } } : NONE;
}

export async function listItems(query: ListItemsQuery): Promise<ItemListDto> {
	const and: Prisma.ItemWhereInput[] = [];
	if (query.location) {
		and.push(await locationFilter(query.location));
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
		items: page.map(toItemSummaryDto),
		nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
	};
}

export async function getItem(id: string): Promise<ItemDetailDto> {
	const item = await db().item.findUnique({
		where: { id: parseId(id) },
		include: itemDetailInclude,
	});
	if (!item) {
		throw notFound("Item not found");
	}
	return toItemDetailDto(item);
}

async function summary(tx: Tx, id: string): Promise<ItemSummaryDto> {
	return toItemSummaryDto(
		await tx.item.findUniqueOrThrow({
			where: { id },
			include: itemSummaryInclude,
		}),
	);
}

async function locationKind(tx: Tx, id: string): Promise<LocationKind> {
	const location = await tx.location.findUnique({
		where: { id },
		select: { kind: true },
	});
	if (!location) {
		throw unprocessable("Location does not exist");
	}
	return location.kind;
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

/** The session must exist (422) and still be open (409). */
async function assertOpenSession(tx: Tx, id: string) {
	const session = await tx.packingSession.findUnique({
		where: { id },
		select: { endedAt: true },
	});
	if (!session) {
		throw unprocessable("Packing session does not exist");
	}
	if (session.endedAt) {
		throw conflict("Packing session has ended");
	}
}

async function setTags(tx: Tx, itemId: string, names: string[]) {
	const tagIds = await ensureTags(tx, names);
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
	input: CreateItemInput,
): Promise<ItemSummaryDto> {
	return db().$transaction(async (tx) => {
		if (input.categoryId) {
			await assertCategory(tx, input.categoryId);
		}
		if (input.sessionId) {
			await assertOpenSession(tx, input.sessionId);
		}
		let status: ItemStatus | undefined = input.status;
		if (input.locationId) {
			const kind = await locationKind(tx, input.locationId);
			status ??= statusForLocationKind(kind) ?? undefined;
		}
		const item = await tx.item.create({
			data: {
				...columns(input),
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
			await setTags(tx, item.id, input.tags);
		}
		return summary(tx, item.id);
	});
}

export async function updateItem(
	id: string,
	input: UpdateItemInput,
): Promise<ItemSummaryDto> {
	const itemId = parseId(id);
	return db().$transaction(async (tx) => {
		const existing = await tx.item.findUnique({
			where: { id: itemId },
			select: { locationId: true },
		});
		if (!existing) {
			throw notFound("Item not found");
		}
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
				await assertOpenSession(tx, input.sessionId);
			}
			const kind = input.locationId
				? await locationKind(tx, input.locationId)
				: null;
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
			await setTags(tx, itemId, input.tags);
		}
		return summary(tx, itemId);
	});
}

/**
 * Deletes the item (its photos, tags, movements and analyses cascade), then
 * the photos' S3 objects. The database comes first so a failed delete never
 * leaves rows pointing at missing objects; an S3 failure after that only
 * orphans objects (logged, the request still succeeds).
 */
export async function deleteItem(id: string): Promise<void> {
	const itemId = parseId(id);
	const photos = await db().$transaction(async (tx) => {
		const item = await tx.item.findUnique({
			where: { id: itemId },
			select: { photos: { select: { id: true } } },
		});
		if (!item) {
			throw notFound("Item not found");
		}
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
 * (no Movement, not counted). Unknown items, location or session are a 422; an
 * ended session is a 409.
 */
export async function moveItems(
	input: MoveItemsInput,
): Promise<{ moved: number }> {
	return db().$transaction(async (tx) => {
		if (input.sessionId) {
			await assertOpenSession(tx, input.sessionId);
		}
		const kind = input.toLocationId
			? await locationKind(tx, input.toLocationId)
			: null;
		const items = await tx.item.findMany({
			where: { id: { in: input.itemIds } },
			select: { id: true, locationId: true },
		});
		if (items.length !== input.itemIds.length) {
			const found = new Set(items.map((i) => i.id));
			const missing = input.itemIds.filter((i) => !found.has(i));
			throw unprocessable(`Unknown item(s): ${missing.join(", ")}`);
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
				status: statusForLocationKind(kind) ?? undefined,
			},
		});
		return { moved: changing.length };
	});
}
