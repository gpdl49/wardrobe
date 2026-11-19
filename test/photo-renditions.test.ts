import { readFile } from "node:fs/promises";
import type { Job } from "pg-boss";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { photoBackground } from "@/lib/jobs/definitions/photo-background";
import { photoRenditions } from "@/lib/jobs/definitions/photo-renditions";
import { jobDefinitions } from "@/lib/jobs/registry";
import * as hooks from "@/lib/photos/hooks";
import { photoKey } from "@/lib/s3";
import { pngImage, rotatedExifJpeg } from "@/test/fixtures/images";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { type FakeS3, installFakeS3 } from "@/test/helpers/s3";
import { userId } from "@/test/helpers/users";

async function makePhoto(data: Partial<Prisma.PhotoUncheckedCreateInput> = {}) {
	return db().photo.create({
		data: {
			ownerId: await userId(),
			kind: "main",
			contentType: "image/jpeg",
			size: 1,
			status: "processing",
			...data,
		},
	});
}

const run = (photoId: string, retryCount = 0) =>
	photoRenditions.handler({ photoId }, {
		id: "job",
		retryCount,
	} as unknown as Job<unknown>);

const reload = (id: string) => db().photo.findUniqueOrThrow({ where: { id } });

it("photo.renditions is registered", () => {
	expect(jobDefinitions).toContain(photoRenditions);
	expect(jobDefinitions).toContain(photoBackground);
});

describeWithDb("photo.renditions job", () => {
	let s3: FakeS3;

	beforeEach(async () => {
		await resetDb();
		s3 = installFakeS3();
	});

	afterEach(() => {
		s3.restore();
		vi.restoreAllMocks();
	});

	it("writes renditions, records dimensions and blurhash, and calls the hook", async () => {
		const ready = vi.spyOn(hooks, "onPhotoReady");
		const photo = await makePhoto();
		s3.upload(photoKey(photo.id, "original"), await rotatedExifJpeg());

		await run(photo.id);

		const after = await reload(photo.id);
		expect(after).toMatchObject({ status: "ready", width: 100, height: 200 });
		expect(after.blurhash).toMatch(/^.{28}$/);
		for (const name of ["display", "thumb"] as const) {
			const object = s3.objects.get(photoKey(photo.id, name));
			expect(object?.contentType).toBe("image/webp");
			const meta = await sharp(object?.body).metadata();
			expect([meta.format, meta.width, meta.height]).toEqual([
				"webp",
				100,
				200,
			]);
		}
		expect(ready).toHaveBeenCalledTimes(1);
		expect(ready.mock.calls[0]?.[0]).toMatchObject({
			id: photo.id,
			status: "ready",
		});
	});

	it("sets the item's cover, preferring a main photo", async () => {
		const item = await makeItem();
		const label = await makePhoto({ itemId: item.id, kind: "label" });
		s3.upload(photoKey(label.id, "original"), await pngImage());
		const main = await makePhoto({ itemId: item.id, kind: "main" });
		s3.upload(photoKey(main.id, "original"), await pngImage());

		// Both become ready before the cover is chosen: main wins.
		await db().photo.update({
			where: { id: label.id },
			data: { status: "ready" },
		});
		await run(main.id);
		expect(
			(await db().item.findUniqueOrThrow({ where: { id: item.id } }))
				.coverPhotoId,
		).toBe(main.id);
	});

	it("processes a photo normally and makes a cutout only when requested", async () => {
		const original = await readFile(
			new URL("./fixtures/white-shirt.jpg", import.meta.url),
		);
		const photo = await makePhoto();
		const originalKey = photoKey(photo.id, "original");
		s3.upload(originalKey, original);

		await run(photo.id);
		expect(await reload(photo.id)).toMatchObject({
			status: "ready",
			backgroundStatus: null,
		});
		expect(
			(
				await sharp(
					s3.objects.get(photoKey(photo.id, "display"))?.body,
				).metadata()
			).hasAlpha,
		).toBe(false);
		expect(s3.objects.has(photoKey(photo.id, "cutout-display"))).toBe(false);

		await db().photo.update({
			where: { id: photo.id },
			data: { backgroundStatus: "queued" },
		});
		await photoBackground.handler({ photoId: photo.id }, {
			retryCount: 0,
		} as Job<unknown>);

		expect(await reload(photo.id)).toMatchObject({
			status: "ready",
			backgroundStatus: "ready",
		});
		expect(s3.objects.get(originalKey)?.body).toEqual(original);
		for (const variant of ["cutout-display", "cutout-thumb"] as const) {
			const rendition = s3.objects.get(photoKey(photo.id, variant));
			expect((await sharp(rendition?.body).metadata()).hasAlpha).toBe(true);
		}
		expect(
			(
				await sharp(
					s3.objects.get(photoKey(photo.id, "display"))?.body,
				).metadata()
			).hasAlpha,
		).toBe(false);
	}, 15_000);

	it("records an uncertain cutout and a terminal storage failure separately", async () => {
		const job = { retryCount: 2 } as Job<unknown>;
		const skipped = await makePhoto({
			status: "ready",
			backgroundStatus: "queued",
		});
		s3.upload(photoKey(skipped.id, "original"), await pngImage());
		await photoBackground.handler({ photoId: skipped.id }, job);
		expect(await reload(skipped.id)).toMatchObject({
			status: "ready",
			backgroundStatus: "skipped",
		});

		const missing = await makePhoto({
			status: "ready",
			backgroundStatus: "queued",
		});
		await expect(
			photoBackground.handler({ photoId: missing.id }, job),
		).rejects.toThrow();
		expect(await reload(missing.id)).toMatchObject({
			status: "ready",
			backgroundStatus: "failed",
		});
	});

	it("keeps an existing cover", async () => {
		const item = await makeItem();
		const existing = await makePhoto({ itemId: item.id, status: "ready" });
		await db().item.update({
			where: { id: item.id },
			data: { coverPhotoId: existing.id },
		});
		const photo = await makePhoto({ itemId: item.id });
		s3.upload(photoKey(photo.id, "original"), await pngImage());
		await run(photo.id);
		expect(
			(await db().item.findUniqueOrThrow({ where: { id: item.id } }))
				.coverPhotoId,
		).toBe(existing.id);
	});

	it("fails an undecodable original at once, without retrying", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const photo = await makePhoto();
		s3.upload(photoKey(photo.id, "original"), new TextEncoder().encode("nope"));
		await expect(run(photo.id)).resolves.toBeUndefined();
		expect((await reload(photo.id)).status).toBe("failed");
		expect(s3.objects.has(photoKey(photo.id, "thumb"))).toBe(false);
	});

	it("retries transient errors and fails the photo on the last attempt", async () => {
		const photo = await makePhoto();
		// No original in the bucket: GetObject throws NoSuchKey.
		await expect(run(photo.id, 0)).rejects.toThrow();
		expect((await reload(photo.id)).status).toBe("processing");
		await expect(run(photo.id, 3)).rejects.toThrow();
		expect((await reload(photo.id)).status).toBe("failed");
	});

	it("does nothing for a deleted or already ready photo", async () => {
		await expect(
			run("0190f5a0-0000-7000-8000-000000000000"),
		).resolves.toBeUndefined();
		const ready = await makePhoto({ status: "ready" });
		await run(ready.id);
		expect(s3.objects.size).toBe(0);
	});
});
