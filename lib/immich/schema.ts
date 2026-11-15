import { z } from "zod";
export const connectionSchema = z.object({
	apiKey: z.string().min(1).max(4096),
});
export const searchSchema = z.object({
	q: z.string().trim().max(500).optional(),
	cursor: z
		.string()
		.regex(/^[1-9]\d{0,8}$/)
		.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const linkSchema = z.object({
	assetIds: z.array(z.uuid()).min(1).max(50),
});
export const uuid = z.uuid();
export const variantSchema = z.enum(["thumb", "display"]);
