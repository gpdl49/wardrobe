import type { SendOptions } from "pg-boss";
import { COLOR_ALGORITHM } from "@/lib/analyses/colors";
import { db } from "@/lib/db";
import { analysisEnabled, env } from "@/lib/env";
import type { Analysis, Photo } from "@/lib/generated/prisma/client";
import type { JobDefinition } from "@/lib/jobs/define";
import { analysisColors } from "@/lib/jobs/definitions/analysis-colors";
import { analysisVision } from "@/lib/jobs/definitions/analysis-vision";
import { enqueue } from "@/lib/jobs/queue";

/**
 * Creating Analysis rows (status queued) and their jobs. Rules:
 *
 * - colours: one per `main` photo that becomes ready (and per re-run);
 * - vision: one per item per trigger. A `main` or `label` photo becoming ready
 *   triggers it, unless the item already has a vision analysis queued or
 *   running (it will see the new photo, since it loads the item's photos when
 *   it runs). Auto-triggered runs start after a short delay, so a main photo
 *   and its label photos taken together share one paid model call.
 * - nothing without an item (unassigned packing captures), and no vision
 *   without OPENROUTER_API_KEY.
 */

/** Delay before an auto-triggered vision job runs, to batch photos. */
export const VISION_DELAY_SECONDS = 20;
/**
 * A queued/running vision analysis older than this is presumed lost (the
 * process died mid-job) and no longer blocks a new one.
 */
export const STALE_AFTER_MS = 15 * 60_000;

type PhotoRef = Pick<Photo, "id" | "itemId" | "kind">;

/** Enqueues the job, or marks the analysis failed if the queue is down. */
async function dispatch(
	job: JobDefinition,
	analysis: Analysis,
	options?: SendOptions,
): Promise<Analysis> {
	try {
		await enqueue(job, { analysisId: analysis.id }, options);
		return analysis;
	} catch (err) {
		console.error(`[analysis] could not enqueue ${job.name}`, err);
		return db().analysis.update({
			where: { id: analysis.id },
			data: {
				status: "failed",
				error: `Could not enqueue: ${err instanceof Error ? err.message : String(err)}`,
			},
		});
	}
}

export async function queueColorsAnalysis(
	itemId: string,
	photoId: string,
): Promise<Analysis> {
	const analysis = await db().analysis.create({
		data: { itemId, photoId, kind: "colors", model: COLOR_ALGORITHM },
	});
	return dispatch(analysisColors, analysis);
}

/**
 * Queues a vision analysis for the item, or returns the one already queued
 * or running (`created: false`). Serialised per item with an advisory lock,
 * so two photos completing at once still make one model call.
 */
export async function queueVisionAnalysis(
	itemId: string,
	photoId: string | null,
	options: SendOptions = {},
): Promise<{ analysis: Analysis; created: boolean }> {
	const result = await db().$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`analysis.vision:${itemId}`}, 0))`;
		const active = await tx.analysis.findFirst({
			where: {
				itemId,
				kind: "vision",
				status: { in: ["queued", "running"] },
				updatedAt: { gte: new Date(Date.now() - STALE_AFTER_MS) },
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		});
		if (active) {
			return { analysis: active, created: false };
		}
		const analysis = await tx.analysis.create({
			data: {
				itemId,
				photoId,
				kind: "vision",
				model: env().OPENROUTER_VISION_MODEL,
			},
		});
		return { analysis, created: true };
	});
	if (!result.created) {
		return result;
	}
	return {
		analysis: await dispatch(analysisVision, result.analysis, options),
		created: true,
	};
}

/**
 * Called when a photo's renditions are ready (lib/photos/hooks onPhotoReady).
 * Returns the analyses it created. Never throws for queue outages (the rows
 * are marked failed instead); database errors propagate.
 */
export async function enqueuePhotoAnalyses(
	photo: PhotoRef,
): Promise<Analysis[]> {
	if (!photo.itemId) {
		return [];
	}
	const created: Analysis[] = [];
	if (photo.kind === "main") {
		created.push(await queueColorsAnalysis(photo.itemId, photo.id));
	}
	if (
		(photo.kind === "main" ||
			photo.kind === "back" ||
			photo.kind === "label") &&
		analysisEnabled()
	) {
		const vision = await queueVisionAnalysis(photo.itemId, photo.id, {
			startAfter: VISION_DELAY_SECONDS,
		});
		if (vision.created) {
			created.push(vision.analysis);
		}
	}
	return created;
}
