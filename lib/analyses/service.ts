import { z } from "zod";
import {
	accessToItem,
	loadAccess,
	requireEdit,
	requireRead,
} from "@/lib/access";
import {
	queueColorsAnalysis,
	queueVisionAnalysis,
} from "@/lib/analyses/enqueue";
import { toAnalysisDto } from "@/lib/analyses/present";
import {
	type ApplyAnalysisInput,
	itemSuggestionSchema,
	type RerunAnalysesInput,
	SEASONS,
} from "@/lib/analyses/schema";
import { VISION_PROMPT_REVISION } from "@/lib/analyses/vision";
import type { AnalysisDto, ItemDetailDto } from "@/lib/api/types";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { analysisEnabled } from "@/lib/env";
import type { Analysis, Prisma } from "@/lib/generated/prisma/client";
import { conflict, notFound, unprocessable } from "@/lib/http/errors";
import { itemDetailInclude, toItemDetailDto } from "@/lib/items/present";
import { ensureTags } from "@/lib/tags/service";

/** Item.notes limit (lib/items/schema). */
const MAX_NOTES = 5000;

const uuid = z.uuid();

function parseId(id: string, what: string): string {
	const parsed = uuid.safeParse(id);
	if (!parsed.success) {
		throw notFound(`${what} not found`);
	}
	return parsed.data;
}

function findItem(id: string) {
	return db().item.findUnique({
		where: { id: parseId(id, "Item") },
		select: { id: true, ownerId: true, locationId: true },
	});
}

/** Analyses follow their item: 404 without access, 403 on view. */
async function requireEditableItem(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const item = await findItem(id);
	if (!item) {
		throw notFound("Item not found");
	}
	requireEdit(accessToItem(ctx, item), "Item");
	return { item, ctx };
}

/** GET /api/items/{id}/analyses: newest first. */
export async function listAnalyses(
	viewer: Viewer,
	itemId: string,
): Promise<AnalysisDto[]> {
	const ctx = await loadAccess(viewer);
	const item = await findItem(itemId);
	if (!item) {
		throw notFound("Item not found");
	}
	requireRead(accessToItem(ctx, item), "Item");
	const rows = await db().analysis.findMany({
		where: { itemId: item.id },
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
	});
	return rows.map(toAnalysisDto);
}

/**
 * POST /api/items/{id}/analyses: re-run. Colours for every ready main photo;
 * one vision analysis for the item (or the one already in flight). Kinds
 * default to colours, plus vision when it is enabled.
 */
export async function rerunAnalyses(
	viewer: Viewer,
	itemId: string,
	input: RerunAnalysesInput,
): Promise<AnalysisDto[]> {
	const { item } = await requireEditableItem(viewer, itemId);
	const visionEnabled = analysisEnabled();
	const kinds =
		input.kinds ?? (visionEnabled ? ["colors", "vision"] : ["colors"]);
	if (kinds.includes("vision") && !visionEnabled) {
		throw conflict("Vision analysis is disabled (no OPENROUTER_API_KEY)");
	}
	const photos = await db().photo.findMany({
		where: {
			itemId: item.id,
			status: "ready",
			kind: { in: ["main", "back", "label"] },
		},
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});
	const analyses: Analysis[] = [];
	if (kinds.includes("colors")) {
		for (const photo of photos.filter((p) => p.kind === "main")) {
			analyses.push(await queueColorsAnalysis(item.id, photo.id));
		}
	}
	if (kinds.includes("vision") && photos.length > 0) {
		analyses.push((await queueVisionAnalysis(item.id, null)).analysis);
	}
	if (analyses.length === 0) {
		throw conflict("The item has no ready photo to analyse");
	}
	return analyses.map(toAnalysisDto);
}

/**
 * POST /api/items/{id}/analyses/{analysisId}/apply: copies the chosen fields
 * of a done analysis onto the item. Fields the analysis did not suggest are
 * skipped. Tags are added to the item's tags; label text is appended to its
 * notes.
 */
export async function applyAnalysis(
	viewer: Viewer,
	itemId: string,
	analysisId: string,
	input: ApplyAnalysisInput,
): Promise<ItemDetailDto> {
	const { item: target, ctx } = await requireEditableItem(viewer, itemId);
	const id = target.id;
	const analysis = await db().analysis.findFirst({
		where: { id: parseId(analysisId, "Analysis"), itemId: id },
	});
	if (!analysis) {
		throw notFound("Analysis not found");
	}
	if (analysis.status !== "done") {
		throw conflict(`The analysis is ${analysis.status}, not done`);
	}
	const parsed = itemSuggestionSchema.safeParse(analysis.result ?? {});
	if (!parsed.success) {
		throw unprocessable("The analysis result is not a valid suggestion");
	}
	const suggestion = parsed.data;

	const item = await db().$transaction(async (tx) => {
		const current = await tx.item.findUniqueOrThrow({
			where: { id },
			select: { notes: true },
		});
		const data: Prisma.ItemUncheckedUpdateInput = {};
		for (const field of input.fields) {
			switch (field) {
				case "name":
					if (suggestion.name !== undefined) {
						data.name = suggestion.name;
						data.nameGenerated = false;
					}
					break;
				case "brand":
				case "size":
				case "pattern":
				case "material":
					if (suggestion[field] !== undefined) data[field] = suggestion[field];
					break;
				case "colors":
					if (suggestion.colors) data.colors = suggestion.colors;
					break;
				case "seasons":
					if (suggestion.seasons) {
						const chosen = suggestion.seasons;
						data.seasons = SEASONS.filter((s) => chosen.includes(s));
					}
					break;
				case "categorySlug": {
					if (!suggestion.categorySlug) break;
					const category = await tx.category.findUnique({
						where: { slug: suggestion.categorySlug },
						select: { id: true },
					});
					if (!category) {
						throw unprocessable(
							`Category "${suggestion.categorySlug}" no longer exists`,
						);
					}
					data.categoryId = category.id;
					break;
				}
				case "tags": {
					if (!suggestion.tags?.length) break;
					const tagIds = await ensureTags(tx, target.ownerId, suggestion.tags);
					await tx.itemTag.createMany({
						data: tagIds.map((tagId) => ({ itemId: id, tagId })),
						skipDuplicates: true,
					});
					break;
				}
				case "labelText": {
					const label = suggestion.labelText;
					if (!label || current.notes?.includes(label)) break;
					const notes = current.notes ? `${current.notes}\n\n${label}` : label;
					if (notes.length > MAX_NOTES) {
						throw unprocessable(
							`Notes would exceed ${MAX_NOTES} characters with the label text`,
						);
					}
					data.notes = notes;
					break;
				}
			}
		}
		await tx.analysis.update({
			where: { id: analysis.id },
			data: { appliedAt: new Date() },
		});
		// Always touch the item: tag-only changes still update updatedAt.
		return tx.item.update({
			where: { id },
			data: { ...data, updatedAt: new Date() },
			include: itemDetailInclude,
		});
	});
	return toItemDetailDto(item, ctx);
}

/** Bulk operations deliberately skip items without edit access. */
async function bulkItems(
	viewer: Viewer,
	input: import("@/lib/analyses/schema").BulkAnalysesInput,
) {
	const ctx = await loadAccess(viewer);
	const items = await db().item.findMany({
		where: {
			...(input.itemIds
				? {
						id: { in: input.itemIds },
						...(input.ownerId ? { ownerId: input.ownerId } : {}),
					}
				: { ownerId: input.ownerId ?? viewer.id }),
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
	});
	return items.filter((item) => {
		const access = accessToItem(ctx, item);
		return access === "owner" || access === "edit";
	});
}
export async function bulkQueueAnalyses(
	viewer: Viewer,
	input: import("@/lib/analyses/schema").BulkAnalysesInput,
) {
	if (!analysisEnabled())
		throw conflict("Vision analysis is disabled (no OPENROUTER_API_KEY)");
	const items = await bulkItems(viewer, input);
	let queued = 0;
	for (const item of items) {
		if (queued >= 50) break;
		const [photo, existing] = await Promise.all([
			db().photo.findFirst({
				where: {
					itemId: item.id,
					status: "ready",
					kind: { in: ["main", "back", "label"] },
				},
			}),
			// In flight, or done with the current prompt: nothing to do. Done
			// before VISION_PROMPT_REVISION is stale and is queued again.
			db().analysis.findFirst({
				where: {
					itemId: item.id,
					kind: "vision",
					OR: [
						{ status: { in: ["queued", "running"] } },
						{ status: "done", createdAt: { gte: VISION_PROMPT_REVISION } },
					],
				},
			}),
		]);
		if (!photo || existing) continue;
		const result = await queueVisionAnalysis(item.id, photo.id);
		if (result.created && result.analysis.status === "queued") queued++;
	}
	return { queued };
}
export async function bulkApplyTags(
	viewer: Viewer,
	input: import("@/lib/analyses/schema").BulkApplyInput,
) {
	const fields = new Set(input.fields);
	const items = await bulkItems(viewer, input);
	let updated = 0;
	for (const item of items) {
		const analysis = await db().analysis.findFirst({
			where: { itemId: item.id, kind: "vision", status: "done" },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		});
		if (!analysis) continue;
		const parsed = itemSuggestionSchema.safeParse(analysis.result ?? {});
		if (!parsed.success) continue;
		const suggestion = parsed.data;
		// Fill only what the item does not have yet: bulk apply never overwrites.
		const data: Prisma.ItemUpdateInput = {};
		if (fields.has("pattern") && !item.pattern && suggestion.pattern) {
			data.pattern = suggestion.pattern;
		}
		if (fields.has("material") && !item.material && suggestion.material) {
			data.material = suggestion.material;
		}
		if (
			fields.has("seasons") &&
			item.seasons.length === 0 &&
			suggestion.seasons?.length
		) {
			const chosen = suggestion.seasons;
			data.seasons = SEASONS.filter((s) => chosen.includes(s));
		}
		await db().$transaction(async (tx) => {
			if (fields.has("tags") && suggestion.tags?.length) {
				const ids = await ensureTags(tx, item.ownerId, suggestion.tags);
				await tx.itemTag.createMany({
					data: ids.map((tagId) => ({ itemId: item.id, tagId })),
					skipDuplicates: true,
				});
			}
			if (Object.keys(data).length > 0) {
				await tx.item.update({ where: { id: item.id }, data });
			}
			await tx.analysis.update({
				where: { id: analysis.id },
				data: { appliedAt: new Date() },
			});
		});
		updated++;
	}
	return { updated };
}
