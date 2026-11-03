import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

type Handler = unknown | ((init: RequestInit | undefined) => unknown);

/**
 * Stubs global fetch with JSON answers keyed by "METHOD /path" (query string
 * ignored). Unmatched requests get a contract 404. Returns the mock so tests
 * can assert on calls.
 */
export function mockApi(routes: Record<string, Handler>) {
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		const key = `${init?.method ?? "GET"} ${url.pathname}`;
		if (!(key in routes)) {
			return Response.json(
				{ error: "not_found", message: `No mock for ${key}` },
				{ status: 404 },
			);
		}
		const handler = routes[key];
		const body = typeof handler === "function" ? handler(init) : handler;
		return body instanceof Response ? body : Response.json(body);
	});
	vi.stubGlobal("fetch", fetch);
	return fetch;
}

/** Calls of a mocked fetch as {method, path, search, body}. */
export function requests(fetch: ReturnType<typeof mockApi>) {
	return fetch.mock.calls.map(([input, init]) => {
		const url = new URL(String(input), "http://localhost");
		return {
			method: init?.method ?? "GET",
			path: url.pathname,
			search: url.search,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		};
	});
}

export function renderWithQuery(ui: ReactElement) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return {
		client,
		...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
	};
}
