import pg from "pg";
import { describe } from "vitest";

/**
 * Postgres-backed tests run against TEST_DATABASE_URL (a throwaway database
 * whose name contains "test"; it is wiped). Without it they are skipped.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || undefined;
export const hasTestDb = Boolean(TEST_DATABASE_URL);

/** `describe` that skips (with a reason in the name) without a test database. */
export const describeWithDb: typeof describe = hasTestDb
	? describe
	: (describe.skip as typeof describe);

export function assertDisposable(url: string): void {
	const name = new URL(url).pathname.replace(/^\//, "");
	if (!/test/i.test(name)) {
		throw new Error(
			`TEST_DATABASE_URL database "${name}" must contain "test": the test suite wipes it`,
		);
	}
}

/** Empties every application table (keeps the migration history). */
export async function resetDb(url = TEST_DATABASE_URL): Promise<void> {
	if (!url) {
		throw new Error("TEST_DATABASE_URL is not set");
	}
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		const { rows } = await client.query<{ tablename: string }>(
			"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
		);
		if (rows.length > 0) {
			await client.query(
				`TRUNCATE ${rows.map((r) => `"public"."${r.tablename}"`).join(", ")} CASCADE`,
			);
		}
	} finally {
		await client.end();
	}
}
