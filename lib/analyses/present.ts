import type { AnalysisDto, ItemSuggestion } from "@/lib/api/types";
import type { Analysis } from "@/lib/generated/prisma/client";

/** Serialises an Analysis row to its API shape (lib/api/types.ts). */
export function toAnalysisDto(analysis: Analysis): AnalysisDto {
	return {
		id: analysis.id,
		itemId: analysis.itemId,
		photoId: analysis.photoId,
		kind: analysis.kind,
		model: analysis.model,
		status: analysis.status,
		result:
			analysis.status === "done"
				? ((analysis.result as ItemSuggestion | null) ?? null)
				: null,
		error: analysis.error,
		appliedAt: analysis.appliedAt?.toISOString() ?? null,
		createdAt: analysis.createdAt.toISOString(),
		updatedAt: analysis.updatedAt.toISOString(),
	};
}
