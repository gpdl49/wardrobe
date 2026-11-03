import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// Mirrors the `@/*` path mapping in tsconfig.json.
			"@": path.resolve(import.meta.dirname),
			// `server-only` throws outside React Server Components bundling.
			"server-only": path.resolve(import.meta.dirname, "test/stubs/empty.ts"),
		},
	},
	test: {
		environment: "node",
		include: [
			"lib/**/*.test.ts",
			"components/**/*.test.ts",
			"components/**/*.test.tsx",
			"test/**/*.test.ts",
		],
		globalSetup: ["test/global-setup.ts"],
		setupFiles: ["test/setup.ts"],
		// Integration tests share one database and reset it between tests.
		fileParallelism: false,
		reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
	},
});
