import { z } from "zod";

export const createSessionSchema = z.strictObject({
	mode: z.enum(["pack", "unpack"]),
	locationId: z.uuid(),
});
export type CreateSessionInput = z.output<typeof createSessionSchema>;
