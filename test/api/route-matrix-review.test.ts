import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as getItem } from "@/app/api/items/[id]/route";
import { POST as dismiss } from "@/app/api/outfit-suggestions/[id]/dismiss/route";
import { DELETE as deleteOutfit } from "@/app/api/outfits/[id]/route";
import { DELETE as unshare } from "@/app/api/outfits/[id]/shares/[shareId]/route";
import { POST as shareOutfitRoute } from "@/app/api/outfits/[id]/shares/route";
import {
	POST as createOutfit,
	GET as listOutfits,
} from "@/app/api/outfits/route";
import { GET as sharedOutfits } from "@/app/api/outfits/shared-with-me/route";
import { GET as photoVariant } from "@/app/api/photos/[id]/[variant]/route";
import { POST as complete } from "@/app/api/photos/[id]/complete/route";
import {
	DELETE as photoDelete,
	PATCH as photoPatch,
} from "@/app/api/photos/[id]/route";
import { POST as photoCreate } from "@/app/api/photos/route";
import { GET as getRun } from "@/app/api/suggestion-runs/[id]/route";
import {
	POST as createRun,
	GET as runs,
} from "@/app/api/suggestion-runs/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { makeOutfit, shareOutfit } from "@/test/helpers/outfits";
import { installFakeS3 } from "@/test/helpers/s3";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

vi.mock("@/lib/jobs/queue", () => ({ enqueue: vi.fn(async () => "job") }));
const actor = (name: string) => ({
	...OTHER_USER,
	sub: name,
	email: `${name}@example.com`,
	username: name,
});
const view = actor("view"),
	edit = actor("edit"),
	direct = actor("direct"),
	locationUser = actor("location");
const actors = [TEST_USER, view, edit, direct, locationUser, THIRD_USER];
describeWithDb("route access matrix", () => {
	let s3: ReturnType<typeof installFakeS3>;
	beforeEach(async () => {
		await resetDb();
		s3 = installFakeS3();
		process.env.OPENROUTER_API_KEY = "test-key";
		resetEnvCache();
		const loc = await makeLocation();
		await share(TEST_USER, view, "view");
		await share(TEST_USER, edit, "edit");
		await share(TEST_USER, locationUser, "edit", loc.id);
	});
	afterEach(() => {
		s3.restore();
		delete process.env.OPENROUTER_API_KEY;
		resetEnvCache();
	});
	it("enforces outfit lists, creation, deletion, and owner-only shares", async () => {
		const ownerId = await userId();
		const outfit = await makeOutfit();
		const directShare = await shareOutfit(outfit.id, await userId(direct));
		const recipient = actor("recipient");
		await userId(recipient);
		for (const [i, user] of actors.entries()) {
			const listed = await json<{ outfits: { id: string }[] }>(
				await listOutfits(
					apiRequest(`/api/outfits?owner=${ownerId}`, { user }),
					{},
				),
			);
			expect(listed.outfits.some((o) => o.id === outfit.id)).toBe(i < 4);
			const shared = await json<{ id: string }[]>(
				await sharedOutfits(apiRequest("/", { user }), {}),
			);
			expect(shared.some((o) => o.id === outfit.id)).toBe(i === 3);
			expect(
				(
					await createOutfit(
						apiRequest("/api/outfits", {
							user,
							method: "POST",
							body: { name: "new", ownerId },
						}),
						{},
					)
				).status,
			).toBe([201, 403, 201, 404, 404, 404][i]);
			expect(
				(
					await shareOutfitRoute(
						apiRequest("/", {
							user,
							method: "POST",
							body: { grantee: "recipient" },
						}),
						routeParams({ id: outfit.id }),
					)
				).status,
			).toBe([201, 403, 403, 403, 404, 404][i]);
			expect(
				(
					await unshare(
						apiRequest("/", { user, method: "DELETE" }),
						routeParams({ id: outfit.id, shareId: directShare.id }),
					)
				).status,
			).toBe([204, 403, 403, 403, 404, 404][i]);
			if (i === 0) await shareOutfit(outfit.id, await userId(direct));
			const target = await makeOutfit();
			await shareOutfit(target.id, await userId(direct));
			expect(
				(
					await deleteOutfit(
						apiRequest("/", { user, method: "DELETE" }),
						routeParams({ id: target.id }),
					)
				).status,
			).toBe([204, 403, 204, 403, 404, 404][i]);
		}
	});
	it("limits outfit photo operations and only reveals an item's cover", async () => {
		const outfit = await makeOutfit();
		await shareOutfit(outfit.id, await userId(direct));
		const item = await makeItem();
		await db().outfitItem.create({
			data: { outfitId: outfit.id, itemId: item.id, position: 0 },
		});
		const mk = () =>
			db().photo.create({
				data: {
					ownerId: outfit.ownerId,
					itemId: item.id,
					kind: "main",
					status: "ready",
					contentType: "image/jpeg",
					size: 1,
				},
			});
		const cover = await mk(),
			other = await mk();
		await db().item.update({
			where: { id: item.id },
			data: { coverPhotoId: cover.id },
		});
		expect(
			(
				await getItem(
					apiRequest("/", { user: direct }),
					routeParams({ id: item.id }),
				)
			).status,
		).toBe(404);
		expect(
			(
				await photoVariant(
					apiRequest("/", { user: direct }),
					routeParams({ id: cover.id, variant: "thumb" }),
				)
			).status,
		).toBe(302);
		expect(
			(
				await photoVariant(
					apiRequest("/", { user: direct }),
					routeParams({ id: other.id, variant: "thumb" }),
				)
			).status,
		).toBe(404);
		for (const [i, user] of actors.entries()) {
			const p = await db().photo.create({
				data: {
					ownerId: outfit.ownerId,
					outfitId: outfit.id,
					kind: "outfit",
					status: "ready",
					contentType: "image/jpeg",
					size: 1,
				},
			});
			const ctx = routeParams({ id: p.id });
			expect(
				(
					await photoVariant(
						apiRequest("/", { user }),
						routeParams({ id: p.id, variant: "thumb" }),
					)
				).status,
			).toBe([302, 302, 302, 302, 404, 404][i]);
			expect(
				(
					await photoCreate(
						apiRequest("/api/photos", {
							user,
							method: "POST",
							body: {
								outfitId: outfit.id,
								kind: "outfit",
								contentType: "image/jpeg",
								size: 1,
							},
						}),
						{},
					)
				).status,
			).toBe([201, 403, 201, 403, 404, 404][i]);
			expect(
				(await complete(apiRequest("/", { user, method: "POST" }), ctx)).status,
			).toBe([200, 403, 200, 403, 404, 404][i]);
			expect(
				(
					await photoPatch(
						apiRequest("/", { user, method: "PATCH", body: { kind: "main" } }),
						ctx,
					)
				).status,
			).toBe([422, 403, 422, 403, 404, 404][i]);
			expect(
				(await photoDelete(apiRequest("/", { user, method: "DELETE" }), ctx))
					.status,
			).toBe([204, 403, 204, 403, 404, 404][i]);
		}
	});
	it("enforces wardrobe access on all suggestion routes", async () => {
		const ownerId = await userId();
		const outfit = await makeOutfit();
		await shareOutfit(outfit.id, await userId(direct));
		await Promise.all(Array.from({ length: 4 }, () => makeItem()));
		const run = await db().suggestionRun.create({
			data: { ownerId, requestedById: ownerId, request: {} },
		});
		for (const [i, user] of actors.entries()) {
			const suggestion = await db().outfitSuggestion.create({
				data: { runId: run.id, ownerId, position: i, name: "x", itemIds: [] },
			});
			expect(
				(
					await runs(
						apiRequest(`/api/suggestion-runs?owner=${ownerId}`, { user }),
						{},
					)
				).status,
			).toBe([200, 200, 200, 404, 404, 404][i]);
			expect(
				(await getRun(apiRequest("/", { user }), routeParams({ id: run.id })))
					.status,
			).toBe([200, 200, 200, 404, 404, 404][i]);
			expect(
				(
					await createRun(
						apiRequest("/api/suggestion-runs", {
							user,
							method: "POST",
							body: { ownerId },
						}),
						{},
					)
				).status,
			).toBe([202, 403, 202, 404, 404, 404][i]);
			expect(
				(
					await dismiss(
						apiRequest("/", { user, method: "POST" }),
						routeParams({ id: suggestion.id }),
					)
				).status,
			).toBe([200, 403, 200, 404, 404, 404][i]);
		}
	});
});
