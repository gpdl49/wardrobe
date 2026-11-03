import { z } from "zod";
import { defineJob } from "@/lib/jobs/define";

/**
 * Example job and smoke test for the queue: logs its payload. Copy this file
 * for new job types (photo.renditions, analysis.colors, analysis.vision) and
 * add them to lib/jobs/registry.ts.
 */
export const systemPing = defineJob({
	name: "system.ping",
	schema: z.object({ message: z.string().max(200) }),
	async handler(data, job) {
		console.info(`[jobs] system.ping ${job.id}: ${data.message}`);
	},
	queue: { retryLimit: 0, expireInSeconds: 60 },
});
