import { z } from "zod";

export const LOCATION_KINDS = [
	"bag",
	"suitcase",
	"closet",
	"drawer",
	"other",
] as const;

/** Codes are stored upper-case: `b-07` and `B-07` are the same label. */
export const locationCode = z
	.string()
	.trim()
	.toUpperCase()
	.regex(
		/^[A-Z0-9][A-Z0-9-]{0,31}$/,
		"Use 1-32 letters, digits and dashes, starting with a letter or digit",
	);

const name = z.string().trim().min(1).max(200);
const notes = z.string().trim().max(5000);
const id = z.uuid();

export const createLocationSchema = z.strictObject({
	kind: z.enum(LOCATION_KINDS),
	code: locationCode,
	name,
	notes: notes.nullish(),
	parentId: id.nullish(),
});
export type CreateLocationInput = z.output<typeof createLocationSchema>;

export const updateLocationSchema = z
	.strictObject({
		kind: z.enum(LOCATION_KINDS),
		code: locationCode,
		name,
		notes: notes.nullable(),
		parentId: id.nullable(),
		/** ISO timestamp to archive, null to unarchive. */
		archivedAt: z.iso.datetime({ offset: true }).nullable(),
	})
	.partial();
export type UpdateLocationInput = z.output<typeof updateLocationSchema>;

const flag = z.enum(["true", "false"]).transform((v) => v === "true");

export const listLocationsQuery = z.object({
	kind: z.enum(LOCATION_KINDS).optional(),
	q: z.string().trim().max(200).optional(),
	/** Not in the contract: archived locations are hidden unless "true". */
	archived: flag.optional(),
});
export type ListLocationsQuery = z.output<typeof listLocationsQuery>;

export const idParam = z.uuid();
