import { z } from "zod";
import { tagList } from "@/lib/tags/schema";

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const ITEM_STATUSES = [
	"active",
	"stored",
	"lent",
	"donated",
	"discarded",
] as const;

/** One entry of Item.colors (the JSON column). */
export const itemColor = z.strictObject({
	name: z.string().trim().toLowerCase().min(1).max(50),
	hex: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^#[0-9a-f]{6}$/, "Use #rrggbb"),
	share: z.number().min(0).max(1),
});

/** Stored sorted by share, largest first (lib/api/types ItemColor). */
export const itemColors = z
	.array(itemColor)
	.max(20)
	.transform((colors) => [...colors].sort((a, b) => b.share - a.share));

const seasons = z
	.array(z.enum(SEASONS))
	.transform((list) => SEASONS.filter((s) => list.includes(s)));

const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);

const fields = {
	name: text(200).nullable(),
	categoryId: id.nullable(),
	brand: text(100).nullable(),
	size: text(50).nullable(),
	colors: itemColors,
	pattern: text(50).nullable(),
	material: text(100).nullable(),
	seasons,
	status: z.enum(ITEM_STATUSES),
	locationId: id.nullable(),
	notes: z.string().trim().max(5000).nullable(),
	/** Replaces the item's tags; names are normalised (lib/tags/schema). */
	tags: tagList,
	/**
	 * Not stored on the item: the packing session a location change belongs
	 * to, recorded on the Movement it writes.
	 */
	sessionId: id,
};

export const createItemSchema = z
	.strictObject({
		...fields,
		/**
		 * Whose wardrobe it goes in. Default: the location's owner, else the
		 * caller. Must match the location's owner when both are given.
		 */
		ownerId: id,
	})
	.partial();
export type CreateItemInput = z.output<typeof createItemSchema>;

export const updateItemSchema = z
	.strictObject({
		...fields,
		/** Must be one of the item's own photos. */
		coverPhotoId: id.nullable(),
	})
	.partial();
export type UpdateItemInput = z.output<typeof updateItemSchema>;

export const listItemsQuery = z.object({
	/** A user id; whose wardrobe to list. Default: the caller's. */
	owner: id.optional(),
	/** Location id or code. */
	location: z.string().trim().min(1).max(64).optional(),
	/** Category id or slug; includes its subcategories. */
	category: z.string().trim().min(1).max(100).optional(),
	tag: z.string().trim().toLowerCase().min(1).max(64).optional(),
	season: z.enum(SEASONS).optional(),
	status: z.enum(ITEM_STATUSES).optional(),
	/** Colour name from the palette, e.g. "navy". */
	color: z.string().trim().toLowerCase().min(1).max(50).optional(),
	q: z.string().trim().min(1).max(200).optional(),
	cursor: z.string().min(1).max(200).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListItemsQuery = z.output<typeof listItemsQuery>;

export const moveItemsSchema = z.strictObject({
	itemIds: z
		.array(id)
		.min(1)
		.max(500)
		.transform((ids) => [...new Set(ids)]),
	/** null moves the items out of any location. */
	toLocationId: id.nullable(),
	sessionId: id.optional(),
});
export type MoveItemsInput = z.output<typeof moveItemsSchema>;
