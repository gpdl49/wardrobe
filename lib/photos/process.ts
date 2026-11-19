import { db } from "@/lib/db";
import { ensureCover } from "@/lib/photos/cover";
import { onPhotoReady } from "@/lib/photos/hooks";
import {
	renderRenditions,
	UnsupportedImageError,
} from "@/lib/photos/renditions";
import { deleteObjects, getObjectBytes, photoKey, putObject } from "@/lib/s3";

export type ProcessOptions = {
	/** Whether a thrown error will be retried (pg-boss retries left). */
	willRetry: boolean;
};

/**
 * The `photo.renditions` job body: original -> display.webp + thumb.webp,
 * dimensions and blurhash, status `ready`, a cover for the item if it has
 * none, then the onPhotoReady hook.
 *
 * Undecodable originals fail the photo at once (retrying cannot help).
 * Other errors (S3, database) are rethrown for pg-boss to retry; on the last
 * attempt the photo is marked `failed` first.
 */
export async function processPhotoRenditions(
	photoId: string,
	{ willRetry }: ProcessOptions,
): Promise<void> {
	const photo = await db().photo.findUnique({ where: { id: photoId } });
	// Deleted since it was queued, or already done by an earlier attempt.
	if (!photo || photo.status === "ready") {
		return;
	}
	try {
		const original = await getObjectBytes(photoKey(photoId, "original"));
		const renditions = await renderRenditions(original, {
			removeBackground: photo.kind === "main",
		});
		await Promise.all([
			putObject(photoKey(photoId, "display"), renditions.display, "image/webp"),
			putObject(photoKey(photoId, "thumb"), renditions.thumb, "image/webp"),
		]);
		const updated = await db().photo.updateManyAndReturn({
			where: { id: photoId },
			data: {
				status: "ready",
				width: renditions.width,
				height: renditions.height,
				blurhash: renditions.blurhash,
			},
		});
		const ready = updated[0];
		if (!ready) {
			// Deleted while rendering: do not leave the renditions behind.
			await deleteObjects([
				photoKey(photoId, "display"),
				photoKey(photoId, "thumb"),
			]);
			return;
		}
		if (ready.itemId) {
			await ensureCover(ready.itemId);
		}
		try {
			await onPhotoReady(ready);
		} catch (err) {
			console.error(`[photos] onPhotoReady failed for ${photoId}`, err);
		}
	} catch (err) {
		const permanent = err instanceof UnsupportedImageError;
		if (permanent || !willRetry) {
			await db().photo.updateMany({
				where: { id: photoId, status: { not: "ready" } },
				data: { status: "failed" },
			});
		}
		if (permanent) {
			console.warn(`[photos] ${photoId}: ${err.message}`);
			return;
		}
		throw err;
	}
}
