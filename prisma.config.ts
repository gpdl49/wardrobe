import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env itself. Local commands use .env; CI and the
// container pass the environment in directly.
if (existsSync(".env")) {
	process.loadEnvFile(".env");
}

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
		seed: "node prisma/seed.mjs",
	},
	datasource: {
		// Not env(): it throws when unset, and `prisma generate` (postinstall,
		// image build) runs without a database.
		url: process.env.DATABASE_URL ?? "",
	},
});
