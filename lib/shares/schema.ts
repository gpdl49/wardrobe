import { z } from "zod";

const access = z.enum(["view", "edit"]);

export const createShareSchema = z.strictObject({
	/** Email or username of someone who has signed in at least once. */
	grantee: z.string().trim().min(1).max(320),
	access,
	/** Absent or null: the whole wardrobe. */
	locationId: z.uuid().nullish(),
});
export type CreateShareInput = z.output<typeof createShareSchema>;

export const updateShareSchema = z.strictObject({ access });
export type UpdateShareInput = z.output<typeof updateShareSchema>;

export const idParam = z.uuid();
