import type { TagCountDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Tags in use, most used first. Tags no item carries any more are left out. */
export async function listTags(): Promise<TagCountDto[]> {
	const rows = await db().tag.findMany({
		select: { name: true, _count: { select: { items: true } } },
	});
	return rows
		.map((row) => ({ name: row.name, count: row._count.items }))
		.filter((tag) => tag.count > 0)
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Ids for already-normalised tag names (lib/tags/schema), creating missing
 * tags. Safe against concurrent creation of the same name.
 */
export async function ensureTags(
	tx: Prisma.TransactionClient,
	names: readonly string[],
): Promise<string[]> {
	if (names.length === 0) {
		return [];
	}
	await tx.tag.createMany({
		data: names.map((name) => ({ name })),
		skipDuplicates: true,
	});
	const tags = await tx.tag.findMany({
		where: { name: { in: [...names] } },
		select: { id: true },
	});
	return tags.map((t) => t.id);
}
