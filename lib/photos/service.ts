import { fromPrisma } from "pg-boss";
import {
	type AccessContext,
	accessToItem,
	accessToOutfit,
	accessToPhoto,
	accessToWardrobe,
	loadAccess,
	requireEdit,
	requireRead,
} from "@/lib/access";
import type { PhotoDto, PhotoUploadDto } from "@/lib/api/types";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import {
	ApiError,
	conflict,
	forbidden,
	notFound,
	unprocessable,
} from "@/lib/http/errors";
import { photoBackground } from "@/lib/jobs/definitions/photo-background";
import { photoRenditions } from "@/lib/jobs/definitions/photo-renditions";
import { enqueue } from "@/lib/jobs/queue";
import { readableCoverThroughOutfit } from "@/lib/outfits/service";
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
 * deletion. Throws ApiErrors; never returns them. Access follows the item; an
 * unassigned photo belongs to its uploader until it is assigned.
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

const withItemAccess = {
	item: { select: { ownerId: true, locationId: true } },
	outfit: { select: { id: true, ownerId: true } },
} as const;

/** The photo and the caller's access to it; 404 without access. */
async function findPhoto(ctx: AccessContext, id: string) {
	const photo = await db().photo.findUnique({
		where: { id: parseId(id) },
		include: withItemAccess,
	});
	if (!photo) {
		throw notFound("Photo not found");
	}
	const access = requireRead(accessToPhoto(ctx, photo), "Photo");
	return { photo, access };
}

/** An item the caller may add photos to: 404 without access, 403 view-only. */
async function findEditableItem(ctx: AccessContext, itemId: string) {
	const item = await db().item.findUnique({
		where: { id: itemId },
		select: { ownerId: true, locationId: true },
	});
	if (!item) {
		throw notFound("Item not found");
	}
	requireEdit(accessToItem(ctx, item), "Item");
	return item;
}

export async function createPhotoUpload(
	viewer: Viewer,
	input: CreatePhotoInput,
): Promise<PhotoUploadDto> {
	if (UNSUPPORTED_CONTENT_TYPES.has(input.contentType)) {
		throw new ApiError(
			422,
			"HEIC/HEIF photos cannot be processed; convert to JPEG before uploading",
			"unsupported_format",
		);
	}
	const ctx = await loadAccess(viewer);
	if (
		(input.kind === "outfit") !== !!input.outfitId ||
		(input.itemId && input.outfitId)
	)
		throw unprocessable(
			"Outfit photos require an outfit and cannot have an item",
		);
	const item = input.itemId ? await findEditableItem(ctx, input.itemId) : null;
	const outfit = input.outfitId
		? await db().outfit.findUnique({
				where: { id: input.outfitId },
				select: { id: true, ownerId: true },
			})
		: null;
	if (input.outfitId && !outfit) throw notFound("Outfit not found");
	if (outfit) requireEdit(accessToOutfit(ctx, outfit), "Outfit");
	const ownerId = outfit?.ownerId ?? item?.ownerId ?? viewer.id;
	const access = requireEdit(
		accessToPhoto(ctx, { ownerId, item, outfit }),
		"Photo",
	);
	const photo = await db().photo.create({
		data: {
			ownerId,
			itemId: input.itemId ?? null,
			outfitId: input.outfitId ?? null,
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
		photo: toPhotoDto(photo, access),
		uploadUrl: put.url,
		uploadHeaders: put.headers,
	};
}

/**
 * An Idempotency-Key replay of POST /api/photos: the stored presigned URL may
 * have expired (the queue re-POSTs with the same key exactly when its PUT got
 * a 400/403), so a photo still pending gets a fresh one. Anything else is
 * replayed as stored. Access is checked again: a caller whose share was
 * revoked since must not get a new upload URL, or the stored one back.
 */
export async function refreshPhotoUpload(
	viewer: Viewer,
	stored: PhotoUploadDto,
): Promise<PhotoUploadDto> {
	const photo = await db().photo.findUnique({
		where: { id: stored.photo.id },
		include: withItemAccess,
	});
	if (!photo) {
		return stored;
	}
	const ctx = await loadAccess(viewer);
	const access = requireEdit(accessToPhoto(ctx, photo), "Photo");
	if (photo.status !== "pending") {
		return stored;
	}
	const put = await presignPut(
		photoKey(photo.id, "original"),
		photo.contentType,
	);
	return {
		photo: toPhotoDto(photo, access),
		uploadUrl: put.url,
		uploadHeaders: put.headers,
	};
}

/**
 * Checks the original arrived and queues the renditions. Idempotent: a photo
 * already processing or ready is returned as is; a failed one is retried.
 */
export async function completePhoto(
	viewer: Viewer,
	id: string,
): Promise<PhotoDto> {
	const ctx = await loadAccess(viewer);
	const { photo, access } = await findPhoto(ctx, id);
	requireEdit(access, "Photo");
	if (photo.status === "processing" || photo.status === "ready") {
		return toPhotoDto(photo, access);
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
		return toPhotoDto((await findPhoto(ctx, photo.id)).photo, access);
	}
	await enqueue(photoRenditions, { photoId: claimed.id });
	return toPhotoDto(claimed, access);
}

/** Presigned GET for a variant; 404 until the object is known to exist. */
export async function variantUrl(
	viewer: Viewer,
	id: string,
	variant: string,
): Promise<string> {
	const parsedVariant = photoVariant.safeParse(variant);
	if (!parsedVariant.success) {
		throw notFound("Unknown photo variant");
	}
	const ctx = await loadAccess(viewer);
	const photo = await db().photo.findUnique({
		where: { id: parseId(id) },
		include: withItemAccess,
	});
	if (
		!photo ||
		(!accessToPhoto(ctx, photo) &&
			!(await readableCoverThroughOutfit(ctx, photo.id)))
	)
		throw notFound("Photo not found");
	const variantName = parsedVariant.data;
	const isCutout =
		variantName === "cutout-display" || variantName === "cutout-thumb";
	const available =
		variantName === "original"
			? photo.status !== "pending"
			: photo.status === "ready" &&
				(!isCutout ||
					(photo.kind === "main" && photo.backgroundStatus === "ready"));
	if (!available) {
		throw notFound(`The ${parsedVariant.data} rendition is not ready`);
	}
	return presignGet(photoKey(photo.id, parsedVariant.data), {
		expiresIn: VARIANT_URL_TTL_SECONDS,
	});
}

export async function queuePhotoBackground(
	viewer: Viewer,
	id: string,
): Promise<PhotoDto> {
	const { photo, access } = await findPhoto(await loadAccess(viewer), id);
	requireEdit(access, "Photo");
	if (photo.kind !== "main")
		throw unprocessable("Only main garment photos support background removal");
	if (photo.status !== "ready") throw conflict("Wait until the photo is ready");

	const updated = await db().$transaction(async (tx) => {
		const [claimed] = await tx.photo.updateManyAndReturn({
			where: {
				id: photo.id,
				kind: "main",
				status: "ready",
				OR: [{ backgroundStatus: null }, { backgroundStatus: "failed" }],
			},
			data: { backgroundStatus: "queued" },
		});
		if (claimed) {
			const jobId = await enqueue(
				photoBackground,
				{ photoId: photo.id },
				{ db: fromPrisma(tx) },
			);
			if (!jobId) throw new Error("Background removal job was not queued");
			return claimed;
		}
		return tx.photo.findUnique({ where: { id: photo.id } });
	});
	if (!updated) throw notFound("Photo not found");
	return toPhotoDto(updated, access);
}

/**
 * Assigns a photo to an item (or unassigns it with null) and/or changes its
 * kind. Covers follow: the old item loses this photo as its cover (and gets
 * its next best one), the new item gets it if it has none.
 *
 * Ownership: a photo stays with its owner, except that an uploader's own
 * unassigned capture passes to the item it is assigned to. Unassigning leaves
 * the photo with the item's owner, so only they or a whole-wardrobe editor may;
 * anyone else would strand it where they could no longer reach it.
 */
export async function updatePhoto(
	viewer: Viewer,
	id: string,
	input: UpdatePhotoInput,
): Promise<PhotoDto> {
	const ctx = await loadAccess(viewer);
	const { photo, access: current } = await findPhoto(ctx, id);
	requireEdit(current, "Photo");
	if (photo.outfitId || input.kind === "outfit")
		throw unprocessable("Outfit photos cannot be reassigned or change kind");
	const target = input.itemId
		? await findEditableItem(ctx, input.itemId)
		: null;
	if (
		target &&
		target.ownerId !== photo.ownerId &&
		(photo.itemId || photo.ownerId !== viewer.id)
	) {
		throw unprocessable("A photo cannot move to another owner's item");
	}
	const moving = input.itemId !== undefined && input.itemId !== photo.itemId;
	if (moving && input.itemId === null) {
		const wardrobe = accessToWardrobe(ctx, photo.ownerId);
		if (wardrobe !== "owner" && wardrobe !== "edit") {
			throw forbidden(
				"Only the owner or a whole-wardrobe editor can unassign this photo",
			);
		}
	}
	const updated = await db().$transaction(async (tx) => {
		if (moving && photo.itemId) {
			await tx.item.updateMany({
				where: { id: photo.itemId, coverPhotoId: photo.id },
				data: { coverPhotoId: null },
			});
		}
		return tx.photo.update({
			where: { id: photo.id },
			data: {
				itemId: input.itemId,
				kind: input.kind,
				ownerId: target?.ownerId,
			},
		});
	});
	if (moving && photo.itemId) {
		await ensureCover(photo.itemId);
	}
	if (updated.itemId) {
		await ensureCover(updated.itemId);
	}
	const access = requireRead(
		accessToPhoto(ctx, {
			ownerId: updated.ownerId,
			item: input.itemId === undefined ? photo.item : target,
		}),
		"Photo",
	);
	return toPhotoDto(updated, access);
}

/** Deletes the objects, then the row (the FK clears any item's cover). */
export async function deletePhoto(viewer: Viewer, id: string): Promise<void> {
	const { photo, access } = await findPhoto(await loadAccess(viewer), id);
	requireEdit(access, "Photo");
	await deleteObjects(allPhotoKeys(photo.id));
	await db().photo.deleteMany({ where: { id: photo.id } });
	if (photo.itemId) {
		await ensureCover(photo.itemId);
	}
}
