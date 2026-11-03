import { z } from "zod";
import { runVisionAnalysis } from "@/lib/analyses/run";
import { defineJob } from "@/lib/jobs/define";

/** OpenRouter vision suggestions for an item. Enqueued by lib/analyses/enqueue. */
export const analysisVision = defineJob({
	name: "analysis.vision",
	schema: z.object({ analysisId: z.uuid() }),
	async handler({ analysisId }) {
		await runVisionAnalysis(analysisId);
	},
	// No retries: each attempt is a paid model call ($5/month key limit). The
	// handler records failures on the Analysis row; the user can re-run.
	queue: { retryLimit: 0, expireInSeconds: 300 },
});
