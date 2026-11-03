import type { PhotoDto, PhotoVariant } from "@/lib/api/types";
import type { Photo } from "@/lib/generated/prisma/client";

const variants: PhotoVariant[] = ["original", "display", "thumb"];

export function photoUrl(id: string, variant: PhotoVariant): string {
	return `/api/photos/${id}/${variant}`;
}

/** Serialises a Photo row to its API shape (lib/api/types.ts). */
export function toPhotoDto(photo: Photo): PhotoDto {
	return {
		id: photo.id,
		itemId: photo.itemId,
		kind: photo.kind,
		status: photo.status,
		contentType: photo.contentType,
		size: photo.size,
		width: photo.width,
		height: photo.height,
		blurhash: photo.blurhash,
		createdAt: photo.createdAt.toISOString(),
		urls: Object.fromEntries(
			variants.map((v) => [v, photoUrl(photo.id, v)]),
		) as Record<PhotoVariant, string>,
	};
}
