import type { JobDefinition } from "@/lib/jobs/define";
import { photoRenditions } from "@/lib/jobs/definitions/photo-renditions";
import { systemPing } from "@/lib/jobs/definitions/system-ping";

/** Every job type the in-process worker handles. Register new ones here. */
export const jobDefinitions: readonly JobDefinition[] = [
	systemPing,
	photoRenditions,
];
