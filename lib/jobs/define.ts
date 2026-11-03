import type { Job, QueueOptions } from "pg-boss";
import type { z } from "zod";

/**
 * A background job type. Payloads are validated with `schema` both when
 * enqueued and when worked, so a stale or hand-inserted job fails loudly
 * instead of running with bad data.
 */
export type JobDefinition<S extends z.ZodType = z.ZodType> = {
	/** pg-boss queue name: `<area>.<action>`, e.g. `photo.renditions`. */
	name: string;
	schema: S;
	handler: (data: z.output<S>, job: Job<unknown>) => Promise<void>;
	/** Queue settings (retries, expiry...), applied when the worker starts. */
	queue?: QueueOptions;
};

export function defineJob<S extends z.ZodType>(
	definition: JobDefinition<S>,
): JobDefinition<S> {
	return definition;
}

export type JobData<J extends JobDefinition> = z.input<J["schema"]>;
