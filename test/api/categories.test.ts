import { beforeEach, describe, expect, it } from "vitest";
import {
	DELETE as deleteCategory,
	PATCH as patchCategory,
} from "@/app/api/categories/[id]/route";
import {
	GET as listCategories,
	POST as postCategory,
} from "@/app/api/categories/route";
import type { CategoryDto } from "@/lib/api/types";
import { db } from "@/lib/db";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams } from "@/test/helpers/http";
import { ADMIN_USER } from "@/test/helpers/users";

const MISSING = "0190f5a0-0000-7000-8000-000000000000";

const create = (body: unknown) =>
	postCategory(
		apiRequest("/api/categories", { method: "POST", body, user: ADMIN_USER }),
		{},
	);
const patch = (id: string, body: unknown) =>
	patchCategory(
		apiRequest(`/api/categories/${id}`, {
			method: "PATCH",
			body,
			user: ADMIN_USER,
		}),
		routeParams({ id }),
	);
const remove = (id: string) =>
	deleteCategory(
		apiRequest(`/api/categories/${id}`, { method: "DELETE", user: ADMIN_USER }),
		routeParams({ id }),
	);

describeWithDb("categories API", () => {
	beforeEach(async () => {
		await resetDb();
	});

	it("lets any signed-in user read but only admins write", async () => {
		const tops = await json<CategoryDto>(await create({ name: "Tops" }));
		const params = routeParams({ id: tops.id });
		const url = `/api/categories/${tops.id}`;

		const list = await listCategories(apiRequest("/api/categories"), {});
		expect(await json<CategoryDto[]>(list)).toHaveLength(1);

		const post = await postCategory(
			apiRequest("/api/categories", { method: "POST", body: { name: "x" } }),
			{},
		);
		const update = await patchCategory(
			apiRequest(url, { method: "PATCH", body: { name: "x" } }),
			params,
		);
		const del = await deleteCategory(
			apiRequest(url, { method: "DELETE" }),
			params,
		);
		for (const response of [post, update, del]) {
			expect(response.status).toBe(403);
			expect(await json(response)).toMatchObject({ error: "forbidden" });
		}
		expect((await db().category.findMany()).map((c) => c.name)).toEqual([
			"Tops",
		]);
	});

	it("creates categories, deriving unique slugs", async () => {
		const first = await create({ name: "Dresses & jumpsuits" });
		expect(first.status).toBe(201);
		const tops = await json<CategoryDto>(first);
		expect(tops).toEqual({
			id: expect.any(String),
			name: "Dresses & jumpsuits",
			slug: "dresses-and-jumpsuits",
			parentId: null,
			sortOrder: 0,
		});
		const again = await json<CategoryDto>(
			await create({ name: "Dresses  & Jumpsuits", sortOrder: 3 }),
		);
		expect(again.slug).toBe("dresses-and-jumpsuits-2");
		expect(again.sortOrder).toBe(3);
	});

	it("409s on an explicit slug that is taken, 400 on a malformed one", async () => {
		await create({ name: "Shirts" });
		expect((await create({ name: "Other", slug: "shirts" })).status).toBe(409);
		expect((await create({ name: "Other", slug: "Bad Slug" })).status).toBe(
			400,
		);
	});

	it("422s on a missing parent", async () => {
		expect((await create({ name: "x", parentId: MISSING })).status).toBe(422);
	});

	it("lists flat, ordered by sortOrder then name", async () => {
		const tops = await json<CategoryDto>(
			await create({ name: "Tops", sortOrder: 1 }),
		);
		await create({ name: "Shirts", parentId: tops.id, sortOrder: 0 });
		await create({ name: "Accessories", sortOrder: 1 });
		const list = await json<CategoryDto[]>(
			await listCategories(apiRequest("/api/categories"), {}),
		);
		expect(list.map((c) => [c.name, c.parentId === tops.id])).toEqual([
			["Shirts", true],
			["Accessories", false],
			["Tops", false],
		]);
	});

	it("updates name, slug, parent and order without changing the slug on rename", async () => {
		const tops = await json<CategoryDto>(await create({ name: "Tops" }));
		const knit = await json<CategoryDto>(await create({ name: "Knitwear" }));
		const response = await patch(knit.id, {
			name: "Knits",
			parentId: tops.id,
			sortOrder: 5,
		});
		expect(response.status).toBe(200);
		expect(await json(response)).toMatchObject({
			name: "Knits",
			slug: "knitwear",
			parentId: tops.id,
			sortOrder: 5,
		});
		expect(
			(await json<CategoryDto>(await patch(knit.id, { slug: "knits" }))).slug,
		).toBe("knits");
		expect((await patch(knit.id, { slug: "tops" })).status).toBe(409);
		expect((await patch(knit.id, { parentId: null })).status).toBe(200);
	});

	it("422s on cycles and a missing parent", async () => {
		const tops = await json<CategoryDto>(await create({ name: "Tops" }));
		const knit = await json<CategoryDto>(
			await create({ name: "Knitwear", parentId: tops.id }),
		);
		const cardigan = await json<CategoryDto>(
			await create({ name: "Cardigans", parentId: knit.id }),
		);
		expect((await patch(tops.id, { parentId: cardigan.id })).status).toBe(422);
		expect((await patch(tops.id, { parentId: tops.id })).status).toBe(422);
		expect((await patch(tops.id, { parentId: MISSING })).status).toBe(422);
	});

	it("404s on unknown and non-UUID ids", async () => {
		for (const id of [MISSING, "nope"]) {
			expect((await patch(id, { name: "x" })).status).toBe(404);
			expect((await remove(id)).status).toBe(404);
		}
	});

	it("deletes a leaf, 409s with children or items", async () => {
		const tops = await json<CategoryDto>(await create({ name: "Tops" }));
		const shirts = await json<CategoryDto>(
			await create({ name: "Shirts", parentId: tops.id }),
		);
		const item = await makeItem({ categoryId: shirts.id });

		expect((await remove(tops.id)).status).toBe(409);
		const withItems = await remove(shirts.id);
		expect(withItems.status).toBe(409);
		expect(await json(withItems)).toMatchObject({ error: "conflict" });

		await db().item.update({
			where: { id: item.id },
			data: { categoryId: null },
		});
		const removed = await remove(shirts.id);
		expect(removed.status).toBe(204);
		expect((await remove(tops.id)).status).toBe(204);
		expect(await db().category.count()).toBe(0);
	});
});

describe("categories API without a database", () => {
	it("401s without auth", async () => {
		const response = await listCategories(
			apiRequest("/api/categories", { user: null }),
			{},
		);
		expect(response.status).toBe(401);
	});
});
