import type { JobDefinition } from "@/lib/jobs/define";
import { analysisColors } from "@/lib/jobs/definitions/analysis-colors";
import { analysisVision } from "@/lib/jobs/definitions/analysis-vision";
import { photoRenditions } from "@/lib/jobs/definitions/photo-renditions";
import { suggestionRun } from "@/lib/jobs/definitions/suggestion-run";
import { systemPing } from "@/lib/jobs/definitions/system-ping";

/** Every job type the in-process worker handles. Register new ones here. */
export const jobDefinitions: readonly JobDefinition[] = [
	systemPing,
	photoRenditions,
	analysisColors,
	analysisVision,
	suggestionRun,
];
