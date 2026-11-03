import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { assertDisposable } from "./helpers/db";

/**
 * Once per run: recreate the test database schema from the migrations, so
 * the suite also proves the migrations apply cleanly.
 */
export default async function globalSetup() {
	const url = process.env.TEST_DATABASE_URL;
	if (!url) {
		console.warn(
			"TEST_DATABASE_URL is not set: database-backed tests are skipped.",
		);
		return;
	}
	assertDisposable(url);
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		await client.query("DROP SCHEMA IF EXISTS public CASCADE");
		await client.query("DROP SCHEMA IF EXISTS pgboss CASCADE");
		await client.query("CREATE SCHEMA public");
	} finally {
		await client.end();
	}
	const root = path.resolve(import.meta.dirname, "..");
	execFileSync(
		process.execPath,
		[
			path.join(root, "node_modules/prisma/build/index.js"),
			"migrate",
			"deploy",
		],
		{
			cwd: root,
			env: { ...process.env, DATABASE_URL: url },
			stdio: "inherit",
		},
	);
}
