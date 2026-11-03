import sharp from "sharp";
import { getObjectBytes, photoKey } from "@/lib/s3";

/**
 * The bytes analyses work on: the display rendition (already rotated and
 * downscaled by the photo pipeline), or the original when the rendition is
 * missing (rendition failed, or an analysis re-run raced it).
 */
export async function loadPhotoBytes(photoId: string): Promise<Uint8Array> {
	try {
		return await getObjectBytes(photoKey(photoId, "display"));
	} catch {
		return getObjectBytes(photoKey(photoId, "original"));
	}
}

/**
 * A downscaled JPEG data: URL for the vision model. Sent inline rather than
 * as a presigned S3 URL: the size (and so the image-token cost) is ours to
 * bound, nothing depends on the provider fetching from S3 before the URL
 * expires, and it also works against MinIO on localhost in development.
 */
export async function toJpegDataUrl(
	bytes: Uint8Array,
	maxEdge: number,
): Promise<string> {
	const jpeg = await sharp(bytes)
		.rotate()
		.resize({
			width: maxEdge,
			height: maxEdge,
			fit: "inside",
			withoutEnlargement: true,
		})
		.flatten({ background: "#ffffff" })
		.jpeg({ quality: 80, mozjpeg: true })
		.toBuffer();
	return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
