import { afterAll } from "vitest";
import { disconnectDb } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";

// Every test file starts from a known environment: proxy auth (the
// production mode) against the test database, no background worker.
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL || "postgresql://unset@localhost/unset";
process.env.AUTH_MODE = "proxy";
process.env.REQUIRED_GROUP = "wardrobe";
process.env.JOBS_ENABLED = "false";
process.env.S3_ENDPOINT = "";
resetEnvCache();

afterAll(async () => {
	await disconnectDb();
});
