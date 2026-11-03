import type { PhotoDto, PhotoUploadDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import { ApiError, notFound, unprocessable } from "@/lib/http/errors";
import { photoRenditions } from "@/lib/jobs/definitions/photo-renditions";
import { enqueue } from "@/lib/jobs/queue";
import { ensureCover } from "@/lib/photos/cover";
import { toPhotoDto } from "@/lib/photos/present";
import {
	type CreatePhotoInput,
	photoIdParam,
	photoVariant,
	UNSUPPORTED_CONTENT_TYPES,
	type UpdatePhotoInput,
} from "@/lib/photos/schema";
import {
	allPhotoKeys,
	deleteObjects,
	headObject,
	MAX_ORIGINAL_BYTES,
	photoKey,
	presignGet,
	presignPut,
} from "@/lib/s3";

/**
 * Photos: presigned upload, completion, rendition redirects, assignment and
 * deletion. Throws ApiErrors; never returns them.
 */

/** Presigned GETs outlive the redirect's `max-age=300` cache. */
export const VARIANT_URL_TTL_SECONDS = 10 * 60;
export const VARIANT_CACHE_CONTROL = "private, max-age=300";

function parseId(id: string): string {
	const parsed = photoIdParam.safeParse(id);
	if (!parsed.success) {
		throw notFound("Photo not found");
	}
	return parsed.data;
}

async function findPhoto(id: string) {
	const photo = await db().photo.findUnique({ where: { id: parseId(id) } });
	if (!photo) {
		throw notFound("Photo not found");
	}
	return photo;
}

async function assertItemExists(itemId: string) {
	const item = await db().item.findUnique({
		where: { id: itemId },
		select: { id: true },
	});
	if (!item) {
		throw notFound("Item not found");
	}
}

export async function createPhotoUpload(
	input: CreatePhotoInput,
): Promise<PhotoUploadDto> {
	if (UNSUPPORTED_CONTENT_TYPES.has(input.contentType)) {
		throw new ApiError(
			422,
			"HEIC/HEIF photos cannot be processed; convert to JPEG before uploading",
			"unsupported_format",
		);
	}
	if (input.itemId) {
		await assertItemExists(input.itemId);
	}
	const photo = await db().photo.create({
		data: {
			itemId: input.itemId ?? null,
			kind: input.kind,
			contentType: input.contentType,
			size: input.size,
		},
	});
	const put = await presignPut(
		photoKey(photo.id, "original"),
		photo.contentType,
	);
	return {
		photo: toPhotoDto(photo),
		uploadUrl: put.url,
		uploadHeaders: put.headers,
	};
}

/**
 * An Idempotency-Key replay of POST /api/photos: the stored presigned URL may
 * have expired (the queue re-POSTs with the same key exactly when its PUT got
 * a 400/403), so a photo still pending gets a fresh one. Anything else is
 * replayed as stored.
 */
export async function refreshPhotoUpload(
	stored: PhotoUploadDto,
): Promise<PhotoUploadDto> {
	const photo = await db().photo.findUnique({ where: { id: stored.photo.id } });
	if (photo?.status !== "pending") {
		return stored;
	}
	const put = await presignPut(
		photoKey(photo.id, "original"),
		photo.contentType,
	);
	return {
		photo: toPhotoDto(photo),
		uploadUrl: put.url,
		uploadHeaders: put.headers,
	};
}

/**
 * Checks the original arrived and queues the renditions. Idempotent: a photo
 * already processing or ready is returned as is; a failed one is retried.
 */
export async function completePhoto(id: string): Promise<PhotoDto> {
	const photo = await findPhoto(id);
	if (photo.status === "processing" || photo.status === "ready") {
		return toPhotoDto(photo);
	}
	const head = await headObject(photoKey(photo.id, "original"));
	if (!head) {
		throw unprocessable("The original has not been uploaded yet");
	}
	if (head.size === 0 || head.size > MAX_ORIGINAL_BYTES) {
		await deleteObjects([photoKey(photo.id, "original")]);
		throw unprocessable(
			`The upload is ${head.size} bytes; it must be 1 byte to ${MAX_ORIGINAL_BYTES} bytes`,
		);
	}
	// Only one concurrent completion wins the transition and enqueues.
	const [claimed] = await db().photo.updateManyAndReturn({
		where: { id: photo.id, status: { in: ["pending", "failed"] } },
		// The stored object is the truth for the size.
		data: { status: "processing", size: head.size },
	});
	if (!claimed) {
		return toPhotoDto(await findPhoto(photo.id));
	}
	await enqueue(photoRenditions, { photoId: claimed.id });
	return toPhotoDto(claimed);
}

/** Presigned GET for a variant; 404 until the object is known to exist. */
export async function variantUrl(id: string, variant: string): Promise<string> {
	const parsedVariant = photoVariant.safeParse(variant);
	if (!parsedVariant.success) {
		throw notFound("Unknown photo variant");
	}
	const photo = await findPhoto(id);
	const available =
		parsedVariant.data === "original"
			? photo.status !== "pending"
			: photo.status === "ready";
	if (!available) {
		throw notFound(`The ${parsedVariant.data} rendition is not ready`);
	}
	return presignGet(photoKey(photo.id, parsedVariant.data), {
		expiresIn: VARIANT_URL_TTL_SECONDS,
	});
}

/**
 * Assigns a photo to an item (or unassigns it with null) and/or changes its
 * kind. Covers follow: the old item loses this photo as its cover (and gets
 * its next best one), the new item gets it if it has none.
 */
export async function updatePhoto(
	id: string,
	input: UpdatePhotoInput,
): Promise<PhotoDto> {
	const photo = await findPhoto(id);
	if (input.itemId) {
		await assertItemExists(input.itemId);
	}
	const moving = input.itemId !== undefined && input.itemId !== photo.itemId;
	const updated = await db().$transaction(async (tx) => {
		if (moving && photo.itemId) {
			await tx.item.updateMany({
				where: { id: photo.itemId, coverPhotoId: photo.id },
				data: { coverPhotoId: null },
			});
		}
		return tx.photo.update({
			where: { id: photo.id },
			data: { itemId: input.itemId, kind: input.kind },
		});
	});
	if (moving && photo.itemId) {
		await ensureCover(photo.itemId);
	}
	if (updated.itemId) {
		await ensureCover(updated.itemId);
	}
	return toPhotoDto(updated);
}

/** Deletes the objects, then the row (the FK clears any item's cover). */
export async function deletePhoto(id: string): Promise<void> {
	const photo = await findPhoto(id);
	await deleteObjects(allPhotoKeys(photo.id));
	await db().photo.deleteMany({ where: { id: photo.id } });
	if (photo.itemId) {
		await ensureCover(photo.itemId);
	}
}
