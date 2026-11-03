import pg from "pg";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, seedCategories, slugify } from "@/prisma/seed.mjs";
import { describeWithDb, resetDb, TEST_DATABASE_URL } from "@/test/helpers/db";

it("slugify makes URL-safe slugs", () => {
	expect(slugify("Dresses & jumpsuits")).toBe("dresses-and-jumpsuits");
	expect(slugify("T-shirts")).toBe("t-shirts");
});

it("default category slugs are unique", () => {
	const names = DEFAULT_CATEGORIES.flatMap(([parent, children]) => [
		parent,
		...children,
	]);
	expect(new Set(names.map(slugify)).size).toBe(names.length);
});

describeWithDb("seedCategories", () => {
	let client: pg.Client;

	beforeEach(async () => {
		await resetDb();
		client = new pg.Client({ connectionString: TEST_DATABASE_URL });
		await client.connect();
	});

	afterEach(async () => {
		await client.end();
	});

	it("inserts a two-level tree once", async () => {
		const expected = DEFAULT_CATEGORIES.reduce(
			(n, [, children]) => n + 1 + children.length,
			0,
		);
		expect(await seedCategories(client)).toBe(expected);
		expect(await seedCategories(client)).toBe(0);

		const { rows } = await client.query<{ depth: number; n: number }>(`
			SELECT CASE WHEN c.parent_id IS NULL THEN 1 ELSE 2 END AS depth, count(*)::int AS n
			FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
			WHERE p.parent_id IS NULL
			GROUP BY 1 ORDER BY 1`);
		expect(rows).toEqual([
			{ depth: 1, n: DEFAULT_CATEGORIES.length },
			{ depth: 2, n: expected - DEFAULT_CATEGORIES.length },
		]);
	});
});
