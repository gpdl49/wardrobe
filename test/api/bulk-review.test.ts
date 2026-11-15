import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as apply } from "@/app/api/items/analyses/apply-tags/route";
import { POST as queue } from "@/app/api/items/analyses/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, json, TEST_USER } from "@/test/helpers/http";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

vi.mock("@/lib/jobs/queue", () => ({ enqueue: vi.fn(async () => "job") }));

describeWithDb("bulk tagging explicit items", () => {
	beforeEach(async () => {
		await resetDb();
		process.env.OPENROUTER_API_KEY = "test-key";
		resetEnvCache();
	});
	afterEach(() => {
		delete process.env.OPENROUTER_API_KEY;
		resetEnvCache();
	});
	it("processes editable items across owners and skips inaccessible items", async () => {
		await share(OTHER_USER, TEST_USER, "edit");
		const own = await makeItem();
		const shared = await makeItem({ ownerId: await userId(OTHER_USER) });
		const hidden = await makeItem({ ownerId: await userId(THIRD_USER) });
		for (const item of [own, shared, hidden]) {
			await db().photo.create({
				data: {
					ownerId: item.ownerId,
					itemId: item.id,
					kind: "main",
					status: "ready",
					contentType: "image/jpeg",
					size: 1,
				},
			});
		}
		const request = () =>
			apiRequest("/api/items/analyses", {
				method: "POST",
				body: { itemIds: [own.id, shared.id, hidden.id] },
			});
		expect(await json(await queue(request(), undefined))).toEqual({
			queued: 2,
		});
		await db().analysis.updateMany({
			data: { status: "done", result: { tags: ["formal"] } },
		});
		expect(await json(await apply(request(), undefined))).toEqual({
			updated: 2,
		});
		expect(await db().itemTag.count()).toBe(2);
	});
	it("limits a call to 50 eligible items and filters explicit IDs by owner", async () => {
		const ownerId = await userId();
		await db().item.createMany({
			data: Array.from({ length: 51 }, () => ({ ownerId })),
		});
		const items = await db().item.findMany({ where: { ownerId } });
		await db().photo.createMany({
			data: items.map((item) => ({
				ownerId,
				itemId: item.id,
				kind: "main" as const,
				status: "ready" as const,
				contentType: "image/jpeg",
				size: 1,
			})),
		});
		const request = (body: unknown) =>
			apiRequest("/api/items/analyses", { method: "POST", body });
		expect(await json(await queue(request({}), undefined))).toEqual({
			queued: 50,
		});
		await share(OTHER_USER, TEST_USER, "edit");
		const other = await makeItem({ ownerId: await userId(OTHER_USER) });
		await db().photo.create({
			data: {
				ownerId: other.ownerId,
				itemId: other.id,
				kind: "main",
				status: "ready",
				contentType: "image/jpeg",
				size: 1,
			},
		});
		expect(
			await json(
				await queue(request({ ownerId, itemIds: [other.id] }), undefined),
			),
		).toEqual({ queued: 0 });
	});
});
