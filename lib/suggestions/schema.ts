import { z } from "zod";
import { SEASONS } from "@/lib/analyses/schema";
export const createSuggestionRunSchema = z.strictObject({
	ownerId: z.uuid().optional(),
	prompt: z.string().trim().max(500).optional(),
	season: z.enum(SEASONS).optional(),
	itemIds: z
		.array(z.uuid())
		.max(5)
		.refine((v) => new Set(v).size === v.length, "Duplicate item IDs")
		.optional(),
	count: z.number().int().min(1).max(6).default(3),
});
export const listSuggestionRunsSchema = z.object({
	owner: z.uuid().optional(),
});
export type CreateSuggestionRunInput = z.output<
	typeof createSuggestionRunSchema
>;
