import { z } from "zod";
import { defineJob } from "@/lib/jobs/define";
import { processPhotoBackground } from "@/lib/photos/background-job";

const RETRY_LIMIT = 2;

export const photoBackground = defineJob({
	name: "photo.background",
	schema: z.object({ photoId: z.uuid() }),
	async handler({ photoId }, job) {
		await processPhotoBackground(photoId, job.retryCount < RETRY_LIMIT);
	},
	queue: {
		retryLimit: RETRY_LIMIT,
		retryDelay: 5,
		retryBackoff: true,
		expireInSeconds: 120,
	},
});
