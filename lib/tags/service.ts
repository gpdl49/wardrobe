import { loadAccess, readableItems } from "@/lib/access";
import type { TagCountDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * One wardrobe's tags (default the caller's), most used first, counting only
 * items the caller may read. Tags with none are left out, so a location share
 * shows only the tags on the items it covers.
 */
export async function listTags(
	viewer: { id: string },
	ownerId: string = viewer.id,
): Promise<TagCountDto[]> {
	const ctx = await loadAccess(viewer);
	const rows = await db().tag.findMany({
		where: { ownerId },
		select: {
			name: true,
			_count: {
				select: {
					items: { where: { item: readableItems(ctx, ownerId) } },
				},
			},
		},
	});
	return rows
		.map((row) => ({ name: row.name, count: row._count.items }))
		.filter((tag) => tag.count > 0)
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Ids for already-normalised tag names (lib/tags/schema) in one owner's
 * wardrobe, creating missing tags. Safe against concurrent creation of the
 * same name.
 */
export async function ensureTags(
	tx: Prisma.TransactionClient,
	ownerId: string,
	names: readonly string[],
): Promise<string[]> {
	if (names.length === 0) {
		return [];
	}
	await tx.tag.createMany({
		data: names.map((name) => ({ ownerId, name })),
		skipDuplicates: true,
	});
	const tags = await tx.tag.findMany({
		where: { ownerId, name: { in: [...names] } },
		select: { id: true },
	});
	return tags.map((t) => t.id);
}
