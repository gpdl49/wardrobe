import { z } from "zod";

export const MAX_TAG_LENGTH = 64;

/** Tags are stored trimmed, lower-case, at most 64 characters. */
export const tagName = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, "Tags cannot be empty")
	.max(MAX_TAG_LENGTH);

/** A tag list, de-duplicated after normalising. */
export const tagList = z
	.array(tagName)
	.max(50)
	.transform((tags) => [...new Set(tags)]);

export const listTagsQuery = z.object({
	/** Whose wardrobe, default the caller. */
	owner: z.uuid().optional(),
});
