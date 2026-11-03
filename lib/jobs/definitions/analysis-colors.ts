import { z } from "zod";
import { runColorsAnalysis } from "@/lib/analyses/run";
import { defineJob } from "@/lib/jobs/define";

/** Dominant colours of a main photo. Enqueued by lib/analyses/enqueue. */
export const analysisColors = defineJob({
	name: "analysis.colors",
	schema: z.object({ analysisId: z.uuid() }),
	async handler({ analysisId }) {
		await runColorsAnalysis(analysisId);
	},
	// The handler records failures on the Analysis row; nothing to retry.
	queue: { retryLimit: 0, expireInSeconds: 300 },
});
