import { db } from "@/lib/db";

// `outfit` photos never belong to an item; ranked last for completeness.
const kindRank = { main: 0, detail: 1, label: 2, outfit: 3 } as const;

/**
 * Gives an item without a cover photo one: its best ready photo (kind `main`
 * first, then `detail`, then `label`; oldest first within a kind). No-op when
 * the item already has a cover, is gone, or has no ready photo. Only fills an
 * empty cover, so it is safe to call concurrently.
 */
export async function ensureCover(itemId: string): Promise<void> {
	const photos = await db().photo.findMany({
		where: { itemId, status: "ready" },
		select: { id: true, kind: true, createdAt: true },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});
	const [best] = photos.sort((a, b) => kindRank[a.kind] - kindRank[b.kind]);
	if (!best) {
		return;
	}
	await db().item.updateMany({
		where: { id: itemId, coverPhotoId: null },
		data: { coverPhotoId: best.id },
	});
}
