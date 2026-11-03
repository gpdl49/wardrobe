import { encode as encodeBlurhash } from "blurhash";
import sharp, { type Metadata, type OutputInfo } from "sharp";

/**
 * Pure image work for the `photo.renditions` job: decode an original, apply
 * its EXIF orientation and write the display and thumb WebP renditions
 * (docs/wardrobe.md "Object keys"). Output carries no metadata (sharp drops
 * EXIF/XMP/ICC unless asked to keep them).
 *
 * HEIC/HEIF: sharp's prebuilt libvips (every platform, including linux-musl
 * in node:24-alpine) has libheif with the AV1 decoder only, no libde265, so
 * HEVC-coded HEIC cannot be decoded here. The API refuses those uploads (422)
 * and the browser converts to JPEG before uploading.
 */

export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;
const BLURHASH_EDGE = 32;

// One small pod: no libvips operation cache, and limit decode concurrency.
sharp.cache(false);
sharp.concurrency(1);

/** The input could not be decoded; retrying will not help. */
export class UnsupportedImageError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "UnsupportedImageError";
	}
}

export type Renditions = {
	display: Buffer;
	thumb: Buffer;
	/** The original's dimensions after orientation. */
	width: number;
	height: number;
	blurhash: string;
};

export async function renderRenditions(input: Uint8Array): Promise<Renditions> {
	let metadata: Metadata;
	let oriented: { data: Buffer; info: OutputInfo };
	try {
		metadata = await sharp(input).metadata();
		// Decode once at display size (oriented, sRGB); the rest derives from it.
		oriented = await sharp(input, { failOn: "error" })
			.autoOrient()
			.resize(DISPLAY_EDGE, DISPLAY_EDGE, {
				fit: "inside",
				withoutEnlargement: true,
			})
			.toColourspace("srgb")
			.raw()
			.toBuffer({ resolveWithObject: true });
	} catch (err) {
		throw new UnsupportedImageError(
			`Cannot decode image: ${(err as Error).message}`,
			{ cause: err },
		);
	}

	const raw = {
		raw: {
			width: oriented.info.width,
			height: oriented.info.height,
			channels: oriented.info.channels,
		},
	} as const;

	const [display, thumb, small] = await Promise.all([
		sharp(oriented.data, raw).webp({ quality: 82 }).toBuffer(),
		sharp(oriented.data, raw)
			.resize(THUMB_EDGE, THUMB_EDGE, {
				fit: "inside",
				withoutEnlargement: true,
			})
			.webp({ quality: 75 })
			.toBuffer(),
		sharp(oriented.data, raw)
			.resize(BLURHASH_EDGE, BLURHASH_EDGE, { fit: "inside" })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true }),
	]);

	const { width: bw, height: bh } = small.info;
	const blurhash = encodeBlurhash(
		new Uint8ClampedArray(small.data),
		bw,
		bh,
		bw >= bh ? 4 : 3,
		bw >= bh ? 3 : 4,
	);

	return {
		display,
		thumb,
		width: metadata.autoOrient?.width ?? oriented.info.width,
		height: metadata.autoOrient?.height ?? oriented.info.height,
		blurhash,
	};
}
