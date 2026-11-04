import { beforeEach, describe, expect, it } from "vitest";
import { PATCH as patchItem } from "@/app/api/items/[id]/route";
import { POST as postItem } from "@/app/api/items/route";
import { GET as listTags } from "@/app/api/tags/route";
import type { ItemSummaryDto, TagCountDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem, makeLocation } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { OTHER_USER, share, userId } from "@/test/helpers/users";

const createItem = async (tags: string[]) =>
	json<ItemSummaryDto>(
		await postItem(
			apiRequest("/api/items", { method: "POST", body: { tags } }),
			{},
		),
	);

describeWithDb("tags API", () => {
	beforeEach(async () => {
		await resetDb();
	});

	it("creates normalised tags on demand and counts them", async () => {
		const first = await createItem([" Wool ", "WORK", "wool"]);
		expect(first.tags).toEqual(["wool", "work"]);
		await createItem(["wool", "linen"]);

		const tags = await json<TagCountDto[]>(
			await listTags(apiRequest("/api/tags"), {}),
		);
		expect(tags).toEqual([
			{ name: "wool", count: 2 },
			{ name: "linen", count: 1 },
			{ name: "work", count: 1 },
		]);
		expect(await db().tag.count()).toBe(3);
	});

	it("leaves out tags no item uses any more", async () => {
		const item = await createItem(["old"]);
		await patchItem(
			apiRequest(`/api/items/${item.id}`, {
				method: "PATCH",
				body: { tags: ["new"] },
			}),
			routeParams({ id: item.id }),
		);
		const tags = await json<TagCountDto[]>(
			await listTags(apiRequest("/api/tags"), {}),
		);
		expect(tags).toEqual([{ name: "new", count: 1 }]);
	});

	describe("per owner", () => {
		/** Tags an item directly, so these tests depend only on the tags API. */
		const tag = async (itemId: string, ownerId: string, name: string) => {
			const row = await db().tag.upsert({
				where: { ownerId_name: { ownerId, name } },
				create: { ownerId, name },
				update: {},
			});
			await db().itemTag.create({ data: { itemId, tagId: row.id } });
		};
		const list = async (query = "", user = TEST_USER) =>
			json<TagCountDto[]>(
				await listTags(apiRequest(`/api/tags${query}`, { user }), {}),
			);

		it("keeps wardrobes apart, even with the same tag name", async () => {
			const mine = await userId();
			const theirs = await userId(OTHER_USER);
			await tag((await makeItem()).id, mine, "wool");
			await tag((await makeItem({ ownerId: theirs })).id, theirs, "wool");
			await tag((await makeItem({ ownerId: theirs })).id, theirs, "wool");

			expect(await list()).toEqual([{ name: "wool", count: 1 }]);
			expect(await list("", OTHER_USER)).toEqual([{ name: "wool", count: 2 }]);
			expect(await db().tag.count()).toBe(2);
		});

		it("shows nothing for a wardrobe the caller has no access to", async () => {
			const theirs = await userId(OTHER_USER);
			await tag((await makeItem({ ownerId: theirs })).id, theirs, "secret");
			expect(await list(`?owner=${theirs}`)).toEqual([]);
		});

		it("counts everything with a whole-wardrobe share", async () => {
			const theirs = await userId(OTHER_USER);
			await tag((await makeItem({ ownerId: theirs })).id, theirs, "wool");
			await share(OTHER_USER, TEST_USER, "view");
			expect(await list(`?owner=${theirs}`)).toEqual([
				{ name: "wool", count: 1 },
			]);
		});

		it("counts only the items a location share covers", async () => {
			const theirs = await userId(OTHER_USER);
			const bag = await makeLocation({ ownerId: theirs, code: "B-1" });
			const inBag = await makeItem({ ownerId: theirs, locationId: bag.id });
			const loose = await makeItem({ ownerId: theirs });
			await tag(inBag.id, theirs, "wool");
			await tag(loose.id, theirs, "wool");
			await tag(loose.id, theirs, "secret");
			await share(OTHER_USER, TEST_USER, "view", bag.id);

			expect(await list(`?owner=${theirs}`)).toEqual([
				{ name: "wool", count: 1 },
			]);
		});

		it("400s on a malformed owner", async () => {
			const response = await listTags(apiRequest("/api/tags?owner=nope"), {});
			expect(response.status).toBe(400);
		});
	});
});
