import { z } from "zod";
import { SEASONS } from "@/lib/items/schema";
import { tagList } from "@/lib/tags/schema";

const fields = {
	name: z.string().trim().min(1).max(200),
	notes: z.string().trim().max(5000).nullable(),
	seasons: z
		.array(z.enum(SEASONS))
		.transform((v) => SEASONS.filter((s) => v.includes(s))),
	tags: tagList,
	itemIds: z
		.array(z.uuid())
		.max(50)
		.refine((v) => new Set(v).size === v.length, "Duplicate items"),
};
export const createOutfitSchema = z
	.strictObject({ ...fields, ownerId: z.uuid(), suggestionId: z.uuid() })
	.partial()
	.extend({ name: fields.name });
export const updateOutfitSchema = z.strictObject(fields).partial();
export const listOutfitsQuery = z.object({
	owner: z.uuid().optional(),
	q: z.string().trim().min(1).max(200).optional(),
	tag: z.string().trim().toLowerCase().min(1).max(64).optional(),
	season: z.string().trim().min(1).max(64).optional(),
	item: z.string().trim().min(1).max(200).optional(),
	cursor: z.string().min(1).max(200).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(24),
});
export const outfitShareSchema = z.strictObject({
	grantee: z.string().trim().min(1).max(320),
});
export type CreateOutfitInput = z.output<typeof createOutfitSchema>;
export type UpdateOutfitInput = z.output<typeof updateOutfitSchema>;
export type ListOutfitsQuery = z.output<typeof listOutfitsQuery>;
