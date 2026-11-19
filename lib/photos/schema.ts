import { z } from "zod";
import { MAX_ORIGINAL_BYTES, PHOTO_VARIANTS } from "@/lib/s3";

export const PHOTO_KINDS = [
	"main",
	"back",
	"label",
	"detail",
	"outfit",
] as const;

/** Photos of the whole garment (front and back): background removal applies. */
export function isGarmentKind(kind: string): kind is "main" | "back" {
	return kind === "main" || kind === "back";
}

/** Content types the API accepts for an original (docs/wardrobe.md). */
export const PHOTO_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
] as const;

/**
 * Accepted by the schema but refused with 422: sharp's prebuilt libvips
 * cannot decode HEVC (lib/photos/renditions.ts). Browsers convert to JPEG.
 */
export const UNSUPPORTED_CONTENT_TYPES: ReadonlySet<string> = new Set([
	"image/heic",
	"image/heif",
]);

const id = z.uuid();

export const createPhotoSchema = z.strictObject({
	itemId: id.nullish(),
	outfitId: id.nullish(),
	kind: z.enum(PHOTO_KINDS),
	contentType: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.enum(PHOTO_CONTENT_TYPES)),
	size: z.int().min(1).max(MAX_ORIGINAL_BYTES),
});
export type CreatePhotoInput = z.output<typeof createPhotoSchema>;

/** Not in the contract table: assign a packing capture to an item, change its kind. */
export const updatePhotoSchema = z
	.strictObject({
		itemId: id.nullable(),
		kind: z.enum(PHOTO_KINDS),
	})
	.partial();
export type UpdatePhotoInput = z.output<typeof updatePhotoSchema>;

export const photoVariant = z.enum(PHOTO_VARIANTS);
export const photoIdParam = id;
