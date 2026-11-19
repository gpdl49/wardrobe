import type { Access, PhotoDto } from "@/lib/api/types";
import type { Photo } from "@/lib/generated/prisma/client";
import type { PhotoVariant } from "@/lib/s3";

export function photoUrl(id: string, variant: PhotoVariant): string {
	return `/api/photos/${id}/${variant}`;
}

/** Serialises a Photo row to its API shape (lib/api/types.ts). */
export function toPhotoDto(photo: Photo, access: Access): PhotoDto {
	const useCutout = photo.kind === "main" && photo.backgroundStatus === "ready";
	return {
		id: photo.id,
		ownerId: photo.ownerId,
		access,
		itemId: photo.itemId,
		outfitId: photo.outfitId,
		kind: photo.kind,
		status: photo.status,
		backgroundStatus: photo.backgroundStatus,
		contentType: photo.contentType,
		size: photo.size,
		width: photo.width,
		height: photo.height,
		blurhash: photo.blurhash,
		createdAt: photo.createdAt.toISOString(),
		urls: {
			original: photoUrl(photo.id, "original"),
			display: photoUrl(photo.id, useCutout ? "cutout-display" : "display"),
			thumb: photoUrl(photo.id, useCutout ? "cutout-thumb" : "thumb"),
		},
	};
}
