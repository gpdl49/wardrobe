import { z } from "zod";
import { defineJob } from "@/lib/jobs/define";
import { runSuggestions } from "@/lib/suggestions/run";
export const suggestionRun = defineJob({
	name: "suggestion.run",
	schema: z.object({ runId: z.uuid() }),
	async handler({ runId }) {
		await runSuggestions(runId);
	},
	queue: { retryLimit: 0, expireInSeconds: 300 },
});
