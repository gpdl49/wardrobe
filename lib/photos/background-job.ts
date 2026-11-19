import { db } from "@/lib/db";
import { renderCutoutRenditions } from "@/lib/photos/renditions";
import { deleteObjects, getObjectBytes, photoKey, putObject } from "@/lib/s3";

export async function processPhotoBackground(
	photoId: string,
	willRetry: boolean,
) {
	const photo = await db().photo.findUnique({ where: { id: photoId } });
	if (photo?.backgroundStatus !== "queued") return;
	const pending = { id: photoId, backgroundStatus: "queued" } as const;
	try {
		const cutout =
			photo.kind === "main" && photo.status === "ready"
				? await renderCutoutRenditions(
						await getObjectBytes(photoKey(photoId, "original")),
					)
				: null;
		if (!cutout) {
			await db().photo.updateMany({
				where: pending,
				data: { backgroundStatus: "skipped" },
			});
			return;
		}
		const display = photoKey(photoId, "cutout-display");
		const thumb = photoKey(photoId, "cutout-thumb");
		const uploads = await Promise.allSettled([
			putObject(display, cutout.display, "image/webp"),
			putObject(thumb, cutout.thumb, "image/webp"),
		]);
		const failure = uploads.find((upload) => upload.status === "rejected");
		if (failure) {
			// A deletion can race a partial upload. The original renditions
			// remain readable, and a retry can replace either cutout object.
			if (!(await db().photo.findUnique({ where: { id: photoId } }))) {
				await deleteObjects([display, thumb]);
			}
			throw failure.reason;
		}
		const { count } = await db().photo.updateMany({
			where: pending,
			data: { backgroundStatus: "ready" },
		});
		if (!count && !(await db().photo.findUnique({ where: { id: photoId } }))) {
			await deleteObjects([display, thumb]);
		}
	} catch (error) {
		if (!willRetry) {
			await db().photo.updateMany({
				where: pending,
				data: { backgroundStatus: "failed" },
			});
		}
		throw error;
	}
}
