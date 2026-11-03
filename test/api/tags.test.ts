import { beforeEach, expect, it } from "vitest";
import { PATCH as patchItem } from "@/app/api/items/[id]/route";
import { POST as postItem } from "@/app/api/items/route";
import { GET as listTags } from "@/app/api/tags/route";
import type { ItemSummaryDto, TagCountDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { apiRequest, json, routeParams } from "@/test/helpers/http";

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
});
