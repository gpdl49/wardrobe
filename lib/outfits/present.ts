import {
	type AccessContext,
	accessToItem,
	accessToOutfit,
	requireRead,
} from "@/lib/access";
import type { OutfitPhotoDto } from "@/lib/api/types";
import type { Prisma } from "@/lib/generated/prisma/client";
import { itemSummaryInclude, toItemSummaryDto } from "@/lib/items/present";

export const outfitInclude = {
	owner: { select: { id: true, email: true, username: true } },
	items: {
		orderBy: { position: "asc" },
		include: { item: { include: itemSummaryInclude } },
	},
	tags: { include: { tag: true } },
	photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
	immichAssets: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
	shares: {
		include: { grantee: { select: { id: true, email: true, username: true } } },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	},
} as const satisfies Prisma.OutfitInclude;
type Row = Prisma.OutfitGetPayload<{ include: typeof outfitInclude }>;
export function presentOutfit(row: Row, ctx: AccessContext) {
	const access = requireRead(accessToOutfit(ctx, row), "Outfit");
	const readableItemIds = row.items
		.filter(({ item }) => accessToItem(ctx, item))
		.map(({ item }) => item.id);
	const items = row.items.map(({ item }) => {
		if (accessToItem(ctx, item)) return toItemSummaryDto(item, ctx);
		const wardrobes = new Map(ctx.wardrobes);
		wardrobes.set(item.ownerId, "view");
		return {
			...toItemSummaryDto(item, { ...ctx, wardrobes }),
			access: "view" as const,
			location: null,
		};
	});
	const uploads: OutfitPhotoDto[] = row.photos.map((p) => ({
		id: p.id,
		source: "upload",
		status: p.status,
		width: p.width,
		height: p.height,
		blurhash: p.blurhash,
		thumbhash: null,
		assetId: null,
		takenAt: null,
		createdAt: p.createdAt.toISOString(),
		urls: {
			display: `/api/photos/${p.id}/display`,
			thumb: `/api/photos/${p.id}/thumb`,
		},
	}));
	const immich: OutfitPhotoDto[] = row.immichAssets.map((p) => ({
		id: p.id,
		source: "immich",
		status: "ready",
		width: p.width,
		height: p.height,
		blurhash: null,
		thumbhash: p.thumbhash,
		assetId: p.assetId,
		takenAt: p.takenAt?.toISOString() ?? null,
		createdAt: p.createdAt.toISOString(),
		urls: {
			display: `/api/outfits/${row.id}/immich-assets/${p.id}/display`,
			thumb: `/api/outfits/${row.id}/immich-assets/${p.id}/thumb`,
		},
	}));
	const photos = [...uploads, ...immich].sort(
		(a, b) =>
			a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
	);
	return {
		id: row.id,
		ownerId: row.ownerId,
		access,
		name: row.name,
		notes: row.notes,
		seasons: row.seasons,
		tags: row.tags.map((t) => t.tag.name).sort(),
		itemCount: items.length,
		previewItems: items
			.slice(0, 6)
			.map((i) => ({ id: i.id, name: i.name, coverPhoto: i.coverPhoto })),
		cover: uploads.find((p) => p.status === "ready") ?? immich[0] ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		owner: row.owner,
		items,
		readableItemIds,
		photos,
		shares:
			access === "owner"
				? row.shares.map((s) => ({
						id: s.id,
						grantee: s.grantee,
						createdAt: s.createdAt.toISOString(),
					}))
				: [],
	};
}
export function summaryOutfit(row: Row, ctx: AccessContext) {
	const { owner, items, readableItemIds, photos, shares, ...summary } =
		presentOutfit(row, ctx);
	return summary;
}
