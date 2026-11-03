// Seeds the default category tree (docs/wardrobe.md: "Seeded with a default
// tree"). Runs at every container start after `prisma migrate deploy`, so it
// only inserts when the categories table is empty: categories the user has
// edited or deleted are never brought back.
//
// Plain JavaScript on `pg` so the runtime image needs no TypeScript tooling.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

/** @type {Array<[string, string[]]>} top-level name -> children */
export const DEFAULT_CATEGORIES = [
	["Tops", ["T-shirts", "Shirts", "Polos", "Blouses", "Tank tops"]],
	["Knitwear", ["Jumpers", "Cardigans", "Sweatshirts", "Hoodies"]],
	["Bottoms", ["Jeans", "Trousers", "Shorts", "Skirts"]],
	["Dresses & jumpsuits", ["Dresses", "Jumpsuits"]],
	["Suits & tailoring", ["Suits", "Blazers", "Waistcoats"]],
	["Outerwear", ["Coats", "Jackets", "Raincoats", "Gilets"]],
	["Activewear", ["Sports tops", "Sports bottoms", "Swimwear"]],
	["Underwear & socks", ["Underwear", "Socks", "Thermals"]],
	["Sleepwear & loungewear", ["Pyjamas", "Loungewear"]],
	["Shoes", ["Trainers", "Boots", "Formal shoes", "Sandals", "Slippers"]],
	["Accessories", ["Hats", "Scarves", "Gloves", "Belts", "Ties", "Bags"]],
	["Traditional wear", ["Kurtas", "Sherwanis", "Other traditional"]],
];

export function slugify(name) {
	return name
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * Inserts the default tree if there are no categories. Returns the number of
 * rows inserted (0 when the table already had rows).
 * @param {import("pg").ClientBase} client
 */
export async function seedCategories(client) {
	await client.query("BEGIN");
	try {
		// Serialise concurrent starts (two pods, or a test run).
		await client.query("LOCK TABLE categories IN EXCLUSIVE MODE");
		const { rows } = await client.query(
			"SELECT count(*)::int AS n FROM categories",
		);
		if (rows[0].n > 0) {
			await client.query("COMMIT");
			return 0;
		}
		let inserted = 0;
		const insert = (id, name, parentId, sortOrder) =>
			client.query(
				"INSERT INTO categories (id, name, slug, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5)",
				[id, name, slugify(name), parentId, sortOrder],
			);
		for (const [i, [parent, children]] of DEFAULT_CATEGORIES.entries()) {
			const parentId = randomUUID();
			await insert(parentId, parent, null, i);
			inserted++;
			for (const [j, child] of children.entries()) {
				await insert(randomUUID(), child, parentId, j);
				inserted++;
			}
		}
		await client.query("COMMIT");
		return inserted;
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	}
}

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required");
	}
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		const inserted = await seedCategories(client);
		console.info(
			inserted > 0
				? `seed: inserted ${inserted} default categories`
				: "seed: categories already present, nothing to do",
		);
	} finally {
		await client.end();
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await main();
}
