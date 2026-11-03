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
		// Component tests (*.test.tsx) opt into jsdom per file with a
		// `// @vitest-environment jsdom` docblock; everything else runs in node.
		include: [
			"lib/**/*.test.{ts,tsx}",
			"components/**/*.test.{ts,tsx}",
			"test/**/*.test.ts",
		],
		globalSetup: ["test/global-setup.ts"],
		setupFiles: ["test/setup.ts", "test/setup-dom.ts"],
		// Integration tests share one database and reset it between tests.
		fileParallelism: false,
		// Integration tests hit Postgres, pg-boss and sharp; on a loaded machine
		// a cold worker can exceed vitest's 5 s default without anything being
		// stuck (no lock waits were seen while they timed out).
		testTimeout: 20_000,
		hookTimeout: 20_000,
		reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
	},
});
