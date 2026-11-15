import type { AccessContext } from "@/lib/access";
import type { SuggestionRequest } from "@/lib/api/types";
import { db } from "@/lib/db";
import type {
	OutfitSuggestion,
	SuggestionRun,
} from "@/lib/generated/prisma/client";
import { itemSummaryInclude, toItemSummaryDto } from "@/lib/items/present";
export async function presentSuggestion(
	row: OutfitSuggestion,
	ctx: AccessContext,
) {
	const items = await db().item.findMany({
		where: { ownerId: row.ownerId, id: { in: row.itemIds } },
		include: itemSummaryInclude,
	});
	const byId = new Map(items.map((item) => [item.id, item]));
	return {
		id: row.id,
		runId: row.runId,
		name: row.name,
		rationale: row.rationale,
		items: row.itemIds.flatMap((id) => {
			const item = byId.get(id);
			return item ? [toItemSummaryDto(item, ctx)] : [];
		}),
		feedback: row.feedback,
		outfitId: row.outfitId,
		createdAt: row.createdAt.toISOString(),
	};
}
export async function presentRun(
	row: SuggestionRun & { suggestions: OutfitSuggestion[] },
	ctx: AccessContext,
) {
	return {
		id: row.id,
		ownerId: row.ownerId,
		status: row.status,
		request: row.request as SuggestionRequest,
		model: row.model,
		error: row.error,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		suggestions: await Promise.all(
			row.suggestions.map((s) => presentSuggestion(s, ctx)),
		),
	};
}
