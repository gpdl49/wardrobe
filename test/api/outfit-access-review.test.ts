import { beforeEach, expect, it } from "vitest";
import { GET, PATCH } from "@/app/api/outfits/[id]/route";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, routeParams, TEST_USER } from "@/test/helpers/http";
import { makeOutfit, shareOutfit } from "@/test/helpers/outfits";
import { OTHER_USER, share, THIRD_USER, userId } from "@/test/helpers/users";

describeWithDb("outfit access matrix", () => {
	beforeEach(async () => {
		await resetDb();
	});
	it("distinguishes wardrobe, outfit and location grants on read and write", async () => {
		const view = {
			...OTHER_USER,
			sub: "view",
			email: "view@example.com",
			username: "view",
		};
		const editor = {
			...OTHER_USER,
			sub: "editor",
			email: "editor@example.com",
			username: "editor",
		};
		const direct = {
			...OTHER_USER,
			sub: "direct",
			email: "direct@example.com",
			username: "direct",
		};
		const locationUser = {
			...OTHER_USER,
			sub: "location",
			email: "location@example.com",
			username: "location",
		};
		const location = await makeLocation();
		const outfit = await makeOutfit();
		await share(TEST_USER, view, "view");
		await share(TEST_USER, editor, "edit");
		await share(TEST_USER, locationUser, "edit", location.id);
		await shareOutfit(outfit.id, await userId(direct));
		for (const [user, read, write] of [
			[TEST_USER, 200, 200],
			[view, 200, 403],
			[editor, 200, 200],
			[direct, 200, 403],
			[locationUser, 404, 404],
			[THIRD_USER, 404, 404],
		] as const) {
			expect(
				(await GET(apiRequest("/", { user }), routeParams({ id: outfit.id })))
					.status,
			).toBe(read);
			expect(
				(
					await PATCH(
						apiRequest("/", {
							user,
							method: "PATCH",
							body: { name: "Updated" },
						}),
						routeParams({ id: outfit.id }),
					)
				).status,
			).toBe(write);
		}
		expect(await db().outfit.count()).toBe(1);
	});
});
