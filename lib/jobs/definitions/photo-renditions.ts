import { z } from "zod";
import { defineJob } from "@/lib/jobs/define";
import { processPhotoRenditions } from "@/lib/photos/process";

const RETRY_LIMIT = 3;

/** Renders display/thumb WebP renditions of an uploaded original (lib/photos/process.ts). */
export const photoRenditions = defineJob({
	name: "photo.renditions",
	schema: z.object({ photoId: z.uuid() }),
	async handler(data, job) {
		await processPhotoRenditions(data.photoId, {
			willRetry: job.retryCount < RETRY_LIMIT,
		});
	},
	queue: {
		retryLimit: RETRY_LIMIT,
		retryDelay: 10,
		retryBackoff: true,
		expireInSeconds: 300,
	},
});
