import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getVariant } from "@/app/api/photos/[id]/[variant]/route";
import { POST as completePhoto } from "@/app/api/photos/[id]/complete/route";
import {
	DELETE as deletePhoto,
	PATCH as patchPhoto,
} from "@/app/api/photos/[id]/route";
import { POST as postPhoto } from "@/app/api/photos/route";
import type { PhotoDto, PhotoUploadDto } from "@/lib/api/types";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { photoRenditions } from "@/lib/jobs/definitions/photo-renditions";
import { MAX_ORIGINAL_BYTES, photoKey } from "@/lib/s3";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { type FakeS3, installFakeS3 } from "@/test/helpers/s3";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

const { enqueue } = vi.hoisted(() => ({
	enqueue: vi.fn(async (..._args: unknown[]) => "job-1"),
}));
vi.mock("@/lib/jobs/queue", () => ({
	enqueue,
	getBoss: vi.fn(),
	stopBoss: vi.fn(),
}));

const MISSING = "0190f5a0-0000-7000-8000-000000000000";
const JPEG_BYTES = new Uint8Array(1234);

async function makePhoto(data: Partial<Prisma.PhotoUncheckedCreateInput> = {}) {
	return db().photo.create({
		data: {
			ownerId: await userId(),
			kind: "main",
			contentType: "image/jpeg",
			size: 1234,
			...data,
		},
	});
}

const post = (body: unknown, user?: User) =>
	postPhoto(apiRequest("/api/photos", { method: "POST", body, user }), {});

const complete = (id: string, user?: User) =>
	completePhoto(
		apiRequest(`/api/photos/${id}/complete`, { method: "POST", user }),
		routeParams({ id }),
	);

const variant = (id: string, name: string, user?: User) =>
	getVariant(
		apiRequest(`/api/photos/${id}/${name}`, { user }),
		routeParams({ id, variant: name }),
	);

const patch = (id: string, body: unknown, user?: User) =>
	patchPhoto(
		apiRequest(`/api/photos/${id}`, { method: "PATCH", body, user }),
		routeParams({ id }),
	);

const remove = (id: string, user?: User) =>
	deletePhoto(
		apiRequest(`/api/photos/${id}`, { method: "DELETE", user }),
		routeParams({ id }),
	);

describeWithDb("photos API", () => {
	let s3: FakeS3;

	beforeEach(async () => {
		await resetDb();
		s3 = installFakeS3();
		enqueue.mockClear();
	});

	afterEach(() => {
		s3.restore();
	});

	describe("POST /api/photos", () => {
		it("creates a pending photo and presigns the original's PUT", async () => {
			const item = await makeItem();
			const response = await post({
				itemId: item.id,
				kind: "main",
				contentType: "image/jpeg",
				size: 1234,
			});
			expect(response.status).toBe(201);
			const body = await json<PhotoUploadDto>(response);
			expect(body.photo).toMatchObject({
				itemId: item.id,
				kind: "main",
				status: "pending",
				contentType: "image/jpeg",
				size: 1234,
				width: null,
				height: null,
				blurhash: null,
			});
			expect(body.photo.urls.thumb).toBe(`/api/photos/${body.photo.id}/thumb`);
			const url = new URL(body.uploadUrl);
			expect(url.pathname).toMatch(
				new RegExp(`/photos/${body.photo.id}/original$`),
			);
			expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
				"content-type",
			);
			expect(body.uploadHeaders).toEqual({ "Content-Type": "image/jpeg" });
		});

		it("accepts an unassigned capture and normalises the content type", async () => {
			const response = await post({
				kind: "label",
				contentType: " IMAGE/WEBP ",
				size: 10,
			});
			expect(response.status).toBe(201);
			const body = await json<PhotoUploadDto>(response);
			expect(body.photo.itemId).toBeNull();
			expect(body.photo.contentType).toBe("image/webp");
		});

		it("404s for an unknown item", async () => {
			const response = await post({
				itemId: MISSING,
				kind: "main",
				contentType: "image/jpeg",
				size: 10,
			});
			expect(response.status).toBe(404);
			expect(await db().photo.count()).toBe(0);
		});

		it.each(["image/heic", "image/heif"])(
			"422s for %s (cannot be decoded server-side)",
			async (contentType) => {
				const response = await post({ kind: "main", contentType, size: 10 });
				expect(response.status).toBe(422);
				expect(await json(response)).toMatchObject({
					error: "unsupported_format",
				});
				expect(await db().photo.count()).toBe(0);
			},
		);

		it.each([
			[{ kind: "main", contentType: "image/gif", size: 10 }],
			[{ kind: "main", contentType: "image/jpeg", size: 0 }],
			[
				{
					kind: "main",
					contentType: "image/jpeg",
					size: MAX_ORIGINAL_BYTES + 1,
				},
			],
			[{ kind: "cover", contentType: "image/jpeg", size: 10 }],
			[{ kind: "main", contentType: "image/jpeg", size: 10, extra: 1 }],
		])("400s on invalid input %j", async (body) => {
			const response = await post(body);
			expect(response.status).toBe(400);
			expect((await json<{ error: string }>(response)).error).toBe(
				"bad_request",
			);
		});

		it("401s without auth", async () => {
			const response = await postPhoto(
				apiRequest("/api/photos", {
					method: "POST",
					user: null,
					body: { kind: "main", contentType: "image/jpeg", size: 10 },
				}),
				{},
			);
			expect(response.status).toBe(401);
		});
	});

	describe("POST /api/photos/{id}/complete", () => {
		it("verifies the upload, marks processing and queues renditions", async () => {
			const photo = await makePhoto({ size: 1000 });
			s3.upload(photoKey(photo.id, "original"), JPEG_BYTES);
			const response = await complete(photo.id);
			expect(response.status).toBe(200);
			const body = await json<PhotoDto>(response);
			expect(body.status).toBe("processing");
			// The stored object's size wins.
			expect(body.size).toBe(JPEG_BYTES.byteLength);
			expect(enqueue).toHaveBeenCalledTimes(1);
			expect(enqueue).toHaveBeenCalledWith(photoRenditions, {
				photoId: photo.id,
			});
		});

		it("is idempotent", async () => {
			const photo = await makePhoto();
			s3.upload(photoKey(photo.id, "original"), JPEG_BYTES);
			const first = await complete(photo.id);
			const second = await complete(photo.id);
			expect(second.status).toBe(200);
			expect(await json<PhotoDto>(second)).toEqual(await json<PhotoDto>(first));
			expect(enqueue).toHaveBeenCalledTimes(1);

			const ready = await makePhoto({ status: "ready" });
			expect((await complete(ready.id)).status).toBe(200);
			expect(enqueue).toHaveBeenCalledTimes(1);
		});

		it("re-queues a failed photo", async () => {
			const photo = await makePhoto({ status: "failed" });
			s3.upload(photoKey(photo.id, "original"), JPEG_BYTES);
			const body = await json<PhotoDto>(await complete(photo.id));
			expect(body.status).toBe("processing");
			expect(enqueue).toHaveBeenCalledTimes(1);
		});

		it("422s when nothing was uploaded", async () => {
			const photo = await makePhoto();
			const response = await complete(photo.id);
			expect(response.status).toBe(422);
			expect(
				(await db().photo.findUniqueOrThrow({ where: { id: photo.id } }))
					.status,
			).toBe("pending");
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("422s and deletes an empty upload", async () => {
			const photo = await makePhoto();
			s3.upload(photoKey(photo.id, "original"), new Uint8Array(0));
			const response = await complete(photo.id);
			expect(response.status).toBe(422);
			expect(s3.objects.has(photoKey(photo.id, "original"))).toBe(false);
		});

		it("404s for unknown and non-UUID ids", async () => {
			for (const id of [MISSING, "nope"]) {
				expect((await complete(id)).status).toBe(404);
			}
		});
	});

	describe("GET /api/photos/{id}/{variant}", () => {
		it("redirects to a short-lived presigned GET with a private cache", async () => {
			const photo = await makePhoto({ status: "ready" });
			for (const name of ["original", "display", "thumb"] as const) {
				const response = await variant(photo.id, name);
				expect(response.status).toBe(302);
				expect(response.headers.get("Cache-Control")).toBe(
					"private, max-age=300",
				);
				const location = new URL(response.headers.get("Location") ?? "");
				expect(location.pathname).toMatch(
					new RegExp(`/${photoKey(photo.id, name)}$`),
				);
				const ttl = Number(location.searchParams.get("X-Amz-Expires"));
				expect(ttl).toBeGreaterThanOrEqual(300);
				expect(ttl).toBeLessThanOrEqual(15 * 60);
			}
		});

		it("serves the original once uploaded but renditions only when ready", async () => {
			const processing = await makePhoto({ status: "processing" });
			expect((await variant(processing.id, "original")).status).toBe(302);
			expect((await variant(processing.id, "display")).status).toBe(404);
			expect((await variant(processing.id, "thumb")).status).toBe(404);

			const pending = await makePhoto();
			expect((await variant(pending.id, "original")).status).toBe(404);

			const failed = await makePhoto({ status: "failed" });
			expect((await variant(failed.id, "thumb")).status).toBe(404);
		});

		it("404s for an unknown photo or variant", async () => {
			const photo = await makePhoto({ status: "ready" });
			expect((await variant(photo.id, "huge")).status).toBe(404);
			expect((await variant(MISSING, "thumb")).status).toBe(404);
			expect((await variant("nope", "thumb")).status).toBe(404);
		});

		it("401s without auth", async () => {
			const photo = await makePhoto({ status: "ready" });
			const response = await getVariant(
				apiRequest(`/api/photos/${photo.id}/thumb`, { user: null }),
				routeParams({ id: photo.id, variant: "thumb" }),
			);
			expect(response.status).toBe(401);
		});
	});

	describe("PATCH /api/photos/{id}", () => {
		it("assigns an unassigned capture to an item, which gets it as cover", async () => {
			const item = await makeItem();
			const photo = await makePhoto({ status: "ready", kind: "detail" });
			const response = await patch(photo.id, { itemId: item.id, kind: "main" });
			expect(response.status).toBe(200);
			expect(await json<PhotoDto>(response)).toMatchObject({
				itemId: item.id,
				kind: "main",
			});
			expect(
				(await db().item.findUniqueOrThrow({ where: { id: item.id } }))
					.coverPhotoId,
			).toBe(photo.id);
		});

		it("moves the cover along when reassigning", async () => {
			const from = await makeItem();
			const to = await makeItem();
			const cover = await makePhoto({ itemId: from.id, status: "ready" });
			const other = await makePhoto({
				itemId: from.id,
				status: "ready",
				kind: "label",
			});
			await db().item.update({
				where: { id: from.id },
				data: { coverPhotoId: cover.id },
			});
			const response = await patch(cover.id, { itemId: to.id });
			expect(response.status).toBe(200);
			const [fromAfter, toAfter] = await Promise.all([
				db().item.findUniqueOrThrow({ where: { id: from.id } }),
				db().item.findUniqueOrThrow({ where: { id: to.id } }),
			]);
			expect(fromAfter.coverPhotoId).toBe(other.id);
			expect(toAfter.coverPhotoId).toBe(cover.id);
		});

		it("unassigns with null and changes only the kind when asked", async () => {
			const item = await makeItem();
			const photo = await makePhoto({ itemId: item.id });
			const kindOnly = await json<PhotoDto>(
				await patch(photo.id, { kind: "label" }),
			);
			expect(kindOnly).toMatchObject({ itemId: item.id, kind: "label" });
			const unassigned = await json<PhotoDto>(
				await patch(photo.id, { itemId: null }),
			);
			expect(unassigned.itemId).toBeNull();
		});

		it("404s for an unknown photo or item, 400s on bad input", async () => {
			const photo = await makePhoto();
			expect((await patch(MISSING, { kind: "main" })).status).toBe(404);
			expect((await patch(photo.id, { itemId: MISSING })).status).toBe(404);
			expect((await patch(photo.id, { kind: "cover" })).status).toBe(400);
			expect((await patch(photo.id, { status: "ready" })).status).toBe(400);
		});
	});

	describe("DELETE /api/photos/{id}", () => {
		it("deletes the objects and the row and clears the cover", async () => {
			const item = await makeItem();
			const photo = await makePhoto({ itemId: item.id, status: "ready" });
			await db().item.update({
				where: { id: item.id },
				data: { coverPhotoId: photo.id },
			});
			for (const name of ["original", "display", "thumb"] as const) {
				s3.upload(photoKey(photo.id, name), JPEG_BYTES);
			}
			const unrelated = photoKey(MISSING, "original");
			s3.upload(unrelated, JPEG_BYTES);

			const response = await remove(photo.id);
			expect(response.status).toBe(204);
			expect(await response.text()).toBe("");
			expect([...s3.objects.keys()]).toEqual([unrelated]);
			expect(await db().photo.count()).toBe(0);
			expect(
				(await db().item.findUniqueOrThrow({ where: { id: item.id } }))
					.coverPhotoId,
			).toBeNull();
		});

		it("falls back to the item's next ready photo as cover", async () => {
			const item = await makeItem();
			const cover = await makePhoto({ itemId: item.id, status: "ready" });
			const next = await makePhoto({ itemId: item.id, status: "ready" });
			await db().item.update({
				where: { id: item.id },
				data: { coverPhotoId: cover.id },
			});
			expect((await remove(cover.id)).status).toBe(204);
			expect(
				(await db().item.findUniqueOrThrow({ where: { id: item.id } }))
					.coverPhotoId,
			).toBe(next.id);
		});

		it("404s for an unknown id", async () => {
			expect((await remove(MISSING)).status).toBe(404);
		});
	});

	describe("access", () => {
		const upload = (itemId?: string) => ({
			...(itemId ? { itemId } : {}),
			kind: "main",
			contentType: "image/jpeg",
			size: 10,
		});

		/** OTHER_USER's item in a location, with a ready photo on it. */
		async function theirs() {
			const ownerId = await userId(OTHER_USER);
			const location = await makeLocation({ ownerId });
			const item = await makeItem({ ownerId, locationId: location.id });
			const photo = await makePhoto({
				ownerId,
				itemId: item.id,
				status: "ready",
			});
			return { ownerId, location, item, photo };
		}

		it("hides everything from a user with no access", async () => {
			const { item, photo } = await theirs();
			expect((await post(upload(item.id))).status).toBe(404);
			expect((await variant(photo.id, "thumb")).status).toBe(404);
			expect((await variant(photo.id, "original")).status).toBe(404);
			expect((await complete(photo.id)).status).toBe(404);
			expect((await patch(photo.id, { kind: "label" })).status).toBe(404);
			expect((await remove(photo.id)).status).toBe(404);
			expect(await db().photo.count()).toBe(1);
			const after = await db().photo.findUniqueOrThrow({
				where: { id: photo.id },
			});
			expect(after.kind).toBe("main");
		});

		it("keeps an unassigned capture to its uploader", async () => {
			const created = await json<PhotoUploadDto>(await post(upload()));
			expect(created.photo).toMatchObject({
				ownerId: await userId(),
				access: "owner",
			});
			const { id } = created.photo;
			await db().photo.update({ where: { id }, data: { status: "ready" } });
			expect((await variant(id, "thumb")).status).toBe(302);
			for (const user of [OTHER_USER, THIRD_USER]) {
				expect((await variant(id, "thumb", user)).status).toBe(404);
				expect((await remove(id, user)).status).toBe(404);
			}
		});

		it("does not show a capture to a location share, only a wardrobe one", async () => {
			const location = await makeLocation();
			await share(TEST_USER, OTHER_USER, "edit", location.id);
			await share(TEST_USER, THIRD_USER, "view");
			const capture = await makePhoto({ status: "ready" });
			expect((await variant(capture.id, "thumb", OTHER_USER)).status).toBe(404);
			expect((await variant(capture.id, "thumb", THIRD_USER)).status).toBe(302);
		});

		it("lets view access read but not write", async () => {
			const { item, photo } = await theirs();
			await share(OTHER_USER, TEST_USER, "view");
			expect((await variant(photo.id, "thumb")).status).toBe(302);
			expect((await post(upload(item.id))).status).toBe(403);
			expect((await complete(photo.id)).status).toBe(403);
			expect((await patch(photo.id, { kind: "label" })).status).toBe(403);
			expect((await remove(photo.id)).status).toBe(403);
			expect(await db().photo.count()).toBe(1);
		});

		it("lets a location editor work inside the share, for the owner", async () => {
			const { ownerId, location, item, photo } = await theirs();
			await share(OTHER_USER, TEST_USER, "edit", location.id);

			const response = await post(upload(item.id));
			expect(response.status).toBe(201);
			const created = await json<PhotoUploadDto>(response);
			expect(created.photo).toMatchObject({ ownerId, access: "edit" });
			s3.upload(photoKey(created.photo.id, "original"), JPEG_BYTES);
			expect((await complete(created.photo.id)).status).toBe(200);

			const patched = await patch(photo.id, { kind: "label" });
			expect(await json(patched)).toMatchObject({
				kind: "label",
				access: "edit",
			});
			expect((await remove(photo.id)).status).toBe(204);
		});

		it("does not reach items outside a location share", async () => {
			const { ownerId, location } = await theirs();
			await share(OTHER_USER, TEST_USER, "edit", location.id);
			const elsewhere = await makeItem({ ownerId });
			const photo = await makePhoto({ ownerId, itemId: elsewhere.id });
			expect((await post(upload(elsewhere.id))).status).toBe(404);
			expect((await variant(photo.id, "original")).status).toBe(404);
		});

		it("passes a capture to the owner of the item it is assigned to", async () => {
			const { ownerId, location, item } = await theirs();
			await share(OTHER_USER, TEST_USER, "edit", location.id);
			const capture = await makePhoto({ status: "ready" });

			const response = await patch(capture.id, { itemId: item.id });
			expect(response.status).toBe(200);
			expect(await json(response)).toMatchObject({
				itemId: item.id,
				ownerId,
				access: "edit",
			});
			expect(
				(await db().photo.findUniqueOrThrow({ where: { id: capture.id } }))
					.ownerId,
			).toBe(ownerId);
			expect((await variant(capture.id, "thumb", OTHER_USER)).status).toBe(302);
		});

		it("needs edit on the item a capture is assigned to", async () => {
			const { item } = await theirs();
			const capture = await makePhoto();
			expect((await patch(capture.id, { itemId: item.id })).status).toBe(404);
			await share(OTHER_USER, TEST_USER, "view");
			expect((await patch(capture.id, { itemId: item.id })).status).toBe(403);
			expect(
				(await db().photo.findUniqueOrThrow({ where: { id: capture.id } }))
					.itemId,
			).toBeNull();
		});

		it("422s moving an assigned photo to another owner's item", async () => {
			const { item, photo } = await theirs();
			await share(OTHER_USER, TEST_USER, "edit");
			const mine = await makeItem();
			const myPhoto = await makePhoto({ itemId: mine.id });
			expect((await patch(photo.id, { itemId: mine.id })).status).toBe(422);
			expect((await patch(myPhoto.id, { itemId: item.id })).status).toBe(422);
		});

		it("422s taking someone else's capture into another wardrobe", async () => {
			const ownerId = await userId(OTHER_USER);
			await share(OTHER_USER, TEST_USER, "edit");
			const capture = await makePhoto({ ownerId });
			const mine = await makeItem();
			expect((await patch(capture.id, { itemId: mine.id })).status).toBe(422);
			const theirItem = await makeItem({ ownerId });
			expect((await patch(capture.id, { itemId: theirItem.id })).status).toBe(
				200,
			);
		});

		it("lets only the owner or a wardrobe editor unassign", async () => {
			const { ownerId, location, photo } = await theirs();
			await share(OTHER_USER, TEST_USER, "edit", location.id);
			await share(OTHER_USER, THIRD_USER, "edit");

			expect((await patch(photo.id, { itemId: null })).status).toBe(403);
			const byEditor = await patch(photo.id, { itemId: null }, THIRD_USER);
			expect(byEditor.status).toBe(200);
			expect(await json(byEditor)).toMatchObject({ itemId: null, ownerId });

			const item = await makeItem({ ownerId, locationId: location.id });
			await patch(photo.id, { itemId: item.id }, OTHER_USER);
			const byOwner = await patch(photo.id, { itemId: null }, OTHER_USER);
			expect(byOwner.status).toBe(200);
			expect(await json(byOwner)).toMatchObject({ ownerId, access: "owner" });
		});
	});
});
