/**
 * In-browser downscale before upload: a 12 MP iPhone photo becomes a ~1 MB
 * JPEG, and HEIC (which the server may not decode) becomes JPEG. Decoding uses
 * createImageBitmap, falling back to <img> (which decodes HEIC on iOS 17+).
 */

/** Longest edge of the uploaded image. */
export const UPLOAD_MAX_EDGE = 2400;
export const UPLOAD_QUALITY = 0.85;
/** Longest edge of the local preview shown in the capture strip. */
export const PREVIEW_MAX_EDGE = 320;
export const PREVIEW_QUALITY = 0.7;

export type Size = { width: number; height: number };

/**
 * Scales `size` to fit within `maxEdge` on its longest side, keeping the
 * aspect ratio. Never upscales; dimensions are whole pixels, at least 1.
 */
export function fitWithin(size: Size, maxEdge: number): Size {
	const { width, height } = size;
	if (!(width > 0 && height > 0)) {
		throw new RangeError(`Invalid image size ${width}x${height}`);
	}
	const longest = Math.max(width, height);
	if (longest <= maxEdge) {
		return { width: Math.round(width), height: Math.round(height) };
	}
	const scale = maxEdge / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

export type Prepared = {
	/** What gets uploaded: JPEG, or the original if it could not be decoded. */
	upload: Blob;
	/** Small JPEG for the capture strip, or null. */
	preview: Blob | null;
};

/** Content types the server accepts as originals (docs/wardrobe.md, object keys). */
const ACCEPTED = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
]);

type Drawable = { source: CanvasImageSource; size: Size; close(): void };

async function decode(blob: Blob): Promise<Drawable> {
	if (typeof createImageBitmap === "function") {
		try {
			// EXIF orientation is applied by default ("from-image").
			const bitmap = await createImageBitmap(blob);
			return {
				source: bitmap,
				size: { width: bitmap.width, height: bitmap.height },
				close: () => bitmap.close(),
			};
		} catch {
			// Fall through: Safari's createImageBitmap rejects some formats <img> takes.
		}
	}
	const url = URL.createObjectURL(blob);
	const img = new Image();
	img.decoding = "async";
	img.src = url;
	try {
		await img.decode();
	} catch (err) {
		URL.revokeObjectURL(url);
		throw err;
	}
	return {
		source: img,
		size: { width: img.naturalWidth, height: img.naturalHeight },
		close: () => URL.revokeObjectURL(url),
	};
}

async function render(
	image: Drawable,
	maxEdge: number,
	quality: number,
): Promise<Blob> {
	const { width, height } = fitWithin(image.size, maxEdge);
	if (typeof OffscreenCanvas === "function") {
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(image.source, 0, 0, width, height);
			return canvas.convertToBlob({ type: "image/jpeg", quality });
		}
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	try {
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Canvas 2D is unavailable");
		}
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(image.source, 0, 0, width, height);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) =>
					blob ? resolve(blob) : reject(new Error("Could not encode JPEG")),
				"image/jpeg",
				quality,
			),
		);
	} finally {
		// iOS keeps canvas memory until the element is shrunk.
		canvas.width = 0;
		canvas.height = 0;
	}
}

/**
 * Downscales and re-encodes a captured photo. If the browser cannot decode
 * it, the original is uploaded unchanged when the server accepts its type.
 */
export async function prepareImage(blob: Blob): Promise<Prepared> {
	let image: Drawable;
	try {
		image = await decode(blob);
	} catch (err) {
		if (ACCEPTED.has(blob.type)) {
			return { upload: blob, preview: null };
		}
		throw err;
	}
	try {
		const upload = await render(image, UPLOAD_MAX_EDGE, UPLOAD_QUALITY);
		const preview = await render(
			image,
			PREVIEW_MAX_EDGE,
			PREVIEW_QUALITY,
		).catch(() => null);
		return { upload, preview };
	} finally {
		image.close();
	}
}
