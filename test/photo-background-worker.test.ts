import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as queueBackground } from "@/app/api/photos/[id]/background/route";
import { db } from "@/lib/db";
import { stopBoss } from "@/lib/jobs/queue";
import { startWorker } from "@/lib/jobs/worker";
import { photoKey } from "@/lib/s3";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, routeParams } from "@/test/helpers/http";
import { type FakeS3, installFakeS3 } from "@/test/helpers/s3";
import { userId } from "@/test/helpers/users";

/**
 * Remove Background end to end: the route queues `photo.background` inside
 * its transaction and the real in-process pg-boss worker runs it.
 */
describeWithDb("photo.background through the worker", () => {
	let s3: FakeS3;

	beforeEach(async () => {
		await resetDb();
		s3 = installFakeS3();
	});

	afterEach(() => {
		s3.restore();
	});

	afterAll(async () => {
		await stopBoss();
	});

	it("produces cutouts for a queued photo", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		await startWorker();
		const item = await makeItem();
		const photo = await db().photo.create({
			data: {
				ownerId: await userId(),
				itemId: item.id,
				kind: "main",
				status: "ready",
				contentType: "image/jpeg",
				size: 1,
			},
		});
		s3.upload(
			photoKey(photo.id, "original"),
			await readFile(new URL("./fixtures/white-shirt.jpg", import.meta.url)),
		);

		const response = await queueBackground(
			apiRequest(`/api/photos/${photo.id}/background`, { method: "POST" }),
			routeParams({ id: photo.id }),
		);
		expect(response.status).toBe(202);

		await vi.waitFor(
			async () =>
				expect(
					(await db().photo.findUniqueOrThrow({ where: { id: photo.id } }))
						.backgroundStatus,
				).toBe("ready"),
			{ timeout: 25_000, interval: 250 },
		);
		expect(s3.objects.has(photoKey(photo.id, "cutout-display"))).toBe(true);
	}, 30_000);
});
