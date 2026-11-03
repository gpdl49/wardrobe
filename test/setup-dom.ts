import { afterEach } from "vitest";

// Only for files that opt into jsdom (`// @vitest-environment jsdom`):
// jest-dom matchers and unmounting rendered trees between tests.
if (typeof document !== "undefined") {
	await import("@testing-library/jest-dom/vitest");
	const { cleanup } = await import("@testing-library/react");
	afterEach(() => {
		cleanup();
	});
}
