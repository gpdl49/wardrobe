import { z } from "zod";

export const categorySlug = z
	.string()
	.trim()
	.toLowerCase()
	.regex(
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
		"Use lower-case letters and digits separated by single dashes",
	)
	.max(100);

const name = z.string().trim().min(1).max(100);
const sortOrder = z.int().min(-1_000_000).max(1_000_000);
const id = z.uuid();

export const createCategorySchema = z.strictObject({
	name,
	/** Derived from the name when absent (with a -2, -3... suffix if taken). */
	slug: categorySlug.optional(),
	parentId: id.nullish(),
	sortOrder: sortOrder.optional(),
});
export type CreateCategoryInput = z.output<typeof createCategorySchema>;

export const updateCategorySchema = z
	.strictObject({
		name,
		/** Renaming does not change the slug; send one to change it. */
		slug: categorySlug,
		parentId: id.nullable(),
		sortOrder,
	})
	.partial();
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;
