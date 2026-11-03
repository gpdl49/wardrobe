import { z } from "zod";
import type { ItemSuggestion } from "@/lib/api/types";

export const ANALYSIS_KINDS = ["colors", "vision"] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

/** Keys of ItemSuggestion, in the order the UI lists them. */
export const SUGGESTION_FIELDS = [
	"name",
	"categorySlug",
	"brand",
	"size",
	"colors",
	"pattern",
	"material",
	"seasons",
	"tags",
	"labelText",
] as const satisfies readonly (keyof ItemSuggestion)[];

// Lengths match the Item columns (prisma/schema.prisma).
export const LIMITS = {
	name: 200,
	brand: 100,
	size: 50,
	pattern: 50,
	material: 100,
	tag: 64,
	tags: 12,
	labelText: 2000,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const itemColorSchema = z.object({
	name: text(50),
	hex: z.string().regex(/^#[0-9a-f]{6}$/i),
	share: z.number().min(0).max(1),
});

/** Tags are stored lower-case and unique. */
export const tagName = z.string().trim().toLowerCase().min(1).max(LIMITS.tag);

/** A stored analysis result (Analysis.result when status is done). */
export const itemSuggestionSchema = z.object({
	name: text(LIMITS.name).optional(),
	categorySlug: text(100).optional(),
	brand: text(LIMITS.brand).optional(),
	size: text(LIMITS.size).optional(),
	colors: z.array(itemColorSchema).optional(),
	pattern: text(LIMITS.pattern).optional(),
	material: text(LIMITS.material).optional(),
	seasons: z.array(z.enum(SEASONS)).optional(),
	tags: z.array(tagName).optional(),
	labelText: text(LIMITS.labelText).optional(),
}) satisfies z.ZodType<ItemSuggestion>;

/** POST /api/items/{id}/analyses */
export const rerunAnalysesSchema = z.strictObject({
	kinds: z
		.array(z.enum(ANALYSIS_KINDS))
		.min(1)
		.transform((kinds) => [...new Set(kinds)])
		.optional(),
});
export type RerunAnalysesInput = z.output<typeof rerunAnalysesSchema>;

/** POST /api/items/{id}/analyses/{analysisId}/apply */
export const applyAnalysisSchema = z.strictObject({
	fields: z
		.array(z.enum(SUGGESTION_FIELDS))
		.min(1)
		.transform((fields) => [...new Set(fields)]),
});
export type ApplyAnalysisInput = z.output<typeof applyAnalysisSchema>;
