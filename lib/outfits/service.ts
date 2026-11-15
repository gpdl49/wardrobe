import { z } from "zod";
import {
	type AccessContext,
	accessToItem,
	accessToOutfit,
	accessToWardrobe,
	loadAccess,
	readableOutfits,
	requireEdit,
	requireRead,
} from "@/lib/access";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
	conflict,
	forbidden,
	notFound,
	unprocessable,
} from "@/lib/http/errors";
import { decodeCursor, encodeCursor } from "@/lib/items/rules";
import { SEASONS } from "@/lib/items/schema";
import {
	outfitInclude,
	presentOutfit,
	summaryOutfit,
} from "@/lib/outfits/present";
import type {
	CreateOutfitInput,
	ListOutfitsQuery,
	UpdateOutfitInput,
} from "@/lib/outfits/schema";
import { allPhotoKeys, deleteObjects } from "@/lib/s3";
import { ensureTags } from "@/lib/tags/service";

function idOr404(id: string) {
	if (!z.uuid().safeParse(id).success) throw notFound("Outfit not found");
	return id;
}
async function getRow(id: string, ctx: AccessContext) {
	const row = await db().outfit.findUnique({
		where: { id: idOr404(id) },
		include: outfitInclude,
	});
	if (!row) throw notFound("Outfit not found");
	requireRead(accessToOutfit(ctx, row), "Outfit");
	return row;
}
export async function getOutfit(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	return presentOutfit(await getRow(id, ctx), ctx);
}
export async function requireOutfitEdit(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const row = await getRow(id, ctx);
	requireEdit(accessToOutfit(ctx, row), "Outfit");
}
export async function listOutfits(viewer: Viewer, q: ListOutfitsQuery) {
	const ctx = await loadAccess(viewer);
	const and: Prisma.OutfitWhereInput[] = [
		readableOutfits(ctx, q.owner ?? viewer.id),
	];
	if (q.q)
		and.push({
			OR: [
				{ name: { contains: q.q, mode: "insensitive" } },
				{ notes: { contains: q.q, mode: "insensitive" } },
			],
		});
	if (q.tag) and.push({ tags: { some: { tag: { name: q.tag } } } });
	if (q.season)
		and.push(
			SEASONS.includes(q.season as (typeof SEASONS)[number])
				? { seasons: { has: q.season as (typeof SEASONS)[number] } }
				: { id: { in: [] } },
		);
	if (q.item)
		and.push(
			z.uuid().safeParse(q.item).success
				? { items: { some: { itemId: q.item } } }
				: { id: { in: [] } },
		);
	if (q.cursor) {
		const { createdAt, id } = decodeCursor(q.cursor);
		and.push({
			OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
		});
	}
	const rows = await db().outfit.findMany({
		where: { AND: and },
		include: outfitInclude,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: q.limit + 1,
	});
	const page = rows.slice(0, q.limit);
	const last = page.at(-1);
	return {
		outfits: page.map((r) => summaryOutfit(r, ctx)),
		nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
	};
}
export async function sharedWithMe(viewer: Viewer) {
	const ctx = await loadAccess(viewer);
	const rows = await db().outfit.findMany({
		where: { shares: { some: { granteeId: viewer.id } } },
		include: outfitInclude,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
	});
	return rows.map((r) => summaryOutfit(r, ctx));
}
async function setItems(
	tx: Prisma.TransactionClient,
	ctx: AccessContext,
	ownerId: string,
	outfitId: string,
	ids: string[],
) {
	const items = await tx.item.findMany({
		where: { id: { in: ids } },
		select: { id: true, ownerId: true, locationId: true },
	});
	if (
		items.length !== ids.length ||
		items.some((i) => i.ownerId !== ownerId || !accessToItem(ctx, i))
	)
		throw unprocessable("Unknown item(s)");
	await tx.outfitItem.deleteMany({ where: { outfitId } });
	if (ids.length)
		await tx.outfitItem.createMany({
			data: ids.map((itemId, position) => ({ outfitId, itemId, position })),
		});
}
async function setTags(
	tx: Prisma.TransactionClient,
	ownerId: string,
	outfitId: string,
	names: string[],
) {
	const ids = await ensureTags(tx, ownerId, names);
	await tx.outfitTag.deleteMany({ where: { outfitId } });
	if (ids.length)
		await tx.outfitTag.createMany({
			data: ids.map((tagId) => ({ outfitId, tagId })),
		});
}
export async function createOutfit(viewer: Viewer, input: CreateOutfitInput) {
	const ctx = await loadAccess(viewer);
	const ownerId = input.ownerId ?? viewer.id;
	requireEdit(accessToWardrobe(ctx, ownerId), "Wardrobe");
	return db().$transaction(async (tx) => {
		if (input.suggestionId) {
			const s = await tx.outfitSuggestion.findUnique({
				where: { id: input.suggestionId },
			});
			if (!s || s.ownerId !== ownerId)
				throw unprocessable("Suggestion does not exist");
			if (s.feedback === "saved") throw conflict("Suggestion already saved");
		}
		const row = await tx.outfit.create({
			data: {
				ownerId,
				name: input.name,
				notes: input.notes,
				seasons: input.seasons,
			},
		});
		if (input.itemIds) await setItems(tx, ctx, ownerId, row.id, input.itemIds);
		if (input.tags) await setTags(tx, ownerId, row.id, input.tags);
		if (input.suggestionId) {
			const result = await tx.outfitSuggestion.updateMany({
				where: { id: input.suggestionId, feedback: { not: "saved" } },
				data: { feedback: "saved", outfitId: row.id },
			});
			if (!result.count) {
				const resultNull = await tx.outfitSuggestion.updateMany({
					where: { id: input.suggestionId, feedback: null },
					data: { feedback: "saved", outfitId: row.id },
				});
				if (!resultNull.count) throw conflict("Suggestion already saved");
			}
		}
		return presentOutfit(
			await tx.outfit.findUniqueOrThrow({
				where: { id: row.id },
				include: outfitInclude,
			}),
			ctx,
		);
	});
}
export async function updateOutfit(
	viewer: Viewer,
	id: string,
	input: UpdateOutfitInput,
) {
	const ctx = await loadAccess(viewer);
	const row = await getRow(id, ctx);
	requireEdit(accessToOutfit(ctx, row), "Outfit");
	return db().$transaction(async (tx) => {
		await tx.outfit.update({
			where: { id: row.id },
			data: { name: input.name, notes: input.notes, seasons: input.seasons },
		});
		if (input.itemIds)
			await setItems(tx, ctx, row.ownerId, row.id, input.itemIds);
		if (input.tags) await setTags(tx, row.ownerId, row.id, input.tags);
		return presentOutfit(
			await tx.outfit.findUniqueOrThrow({
				where: { id: row.id },
				include: outfitInclude,
			}),
			ctx,
		);
	});
}
export async function deleteOutfit(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const row = await getRow(id, ctx);
	requireEdit(accessToOutfit(ctx, row), "Outfit");
	await deleteObjects(row.photos.flatMap((p) => allPhotoKeys(p.id)));
	await db().outfit.delete({ where: { id: row.id } });
}
async function ownerOutfit(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const row = await getRow(id, ctx);
	if (row.ownerId !== viewer.id)
		throw forbidden("Only the owner manages outfit shares");
	return row;
}
export async function createOutfitShare(
	viewer: Viewer,
	id: string,
	value: string,
) {
	const row = await ownerOutfit(viewer, id);
	const match = { equals: value, mode: "insensitive" } as const;
	const users = await db().user.findMany({
		where: { OR: [{ email: match }, { username: match }] },
		select: { id: true, email: true, username: true },
		take: 2,
	});
	const grantee = users[0];
	if (users.length !== 1 || !grantee || grantee.id === viewer.id)
		throw unprocessable("Unknown grantee");
	try {
		const s = await db().outfitShare.create({
			data: { outfitId: row.id, granteeId: grantee.id },
			include: {
				grantee: { select: { id: true, email: true, username: true } },
			},
		});
		return {
			id: s.id,
			grantee: s.grantee,
			createdAt: s.createdAt.toISOString(),
		};
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
			throw conflict("Already shared");
		throw e;
	}
}
export async function deleteOutfitShare(
	viewer: Viewer,
	id: string,
	shareId: string,
) {
	const row = await ownerOutfit(viewer, id);
	if (!z.uuid().safeParse(shareId).success) throw notFound("Share not found");
	const { count } = await db().outfitShare.deleteMany({
		where: { id: shareId, outfitId: row.id },
	});
	if (!count) throw notFound("Share not found");
}
export async function readableCoverThroughOutfit(
	ctx: AccessContext,
	photoId: string,
) {
	return !!(await db().item.findFirst({
		where: {
			coverPhotoId: photoId,
			outfits: {
				some: {
					outfit: {
						OR: [
							{ ownerId: ctx.viewerId },
							{ ownerId: { in: [...ctx.wardrobes.keys()] } },
							{ id: { in: [...ctx.outfits] } },
						],
					},
				},
			},
		},
		select: { id: true },
	}));
}
