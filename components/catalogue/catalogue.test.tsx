// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { location } from "@/test/helpers/factories";

// A tiny in-memory router: useSearchParams follows router.replace.
const nav = vi.hoisted(() => {
	let search = "";
	const listeners = new Set<() => void>();
	return {
		get: () => search,
		set(url: string) {
			search = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
			for (const l of listeners) l();
		},
		subscribe(l: () => void) {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		replace: vi.fn(),
	};
});

vi.mock("next/navigation", () => ({
	usePathname: () => "/",
	useRouter: () => ({
		replace: (url: string, options?: unknown) => {
			nav.replace(url, options);
			nav.set(url);
		},
		push: vi.fn(),
		back: vi.fn(),
	}),
	useSearchParams: () => {
		const search = useSyncExternalStore(nav.subscribe, nav.get, nav.get);
		return new URLSearchParams(search);
	},
}));

const { Catalogue } = await import("./catalogue");

const item = (id: string, name: string) => ({
	id,
	name,
	category: null,
	brand: null,
	size: null,
	colors: [],
	pattern: null,
	material: null,
	seasons: [],
	status: "active",
	location: null,
	notes: null,
	tags: [],
	coverPhoto: null,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
});

function setup(search: string) {
	act(() => nav.set(`/?${search}`));
	nav.replace.mockClear();
	return mockApi({
		"GET /api/locations": [location({ id: "loc-1", code: "B-01" })],
		"GET /api/categories": [],
		"GET /api/tags": [{ name: "wool", count: 3 }],
		"GET /api/items": { items: [item("i1", "Navy coat")], nextCursor: null },
	});
}

const itemQueries = (fetch: ReturnType<typeof mockApi>) =>
	requests(fetch)
		.filter((r) => r.path === "/api/items")
		.map((r) => new URLSearchParams(r.search));

describe("catalogue filters and the URL", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it("starts from the query string", async () => {
		const fetch = setup("season=winter&location=loc-1&view=list");
		renderWithQuery(<Catalogue />);
		expect(await screen.findByText("Navy coat")).toBeInTheDocument();

		expect(screen.getByRole("button", { name: "Winter" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByLabelText("Location")).toHaveValue("loc-1");
		expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		const [query] = itemQueries(fetch);
		expect(query?.get("season")).toBe("winter");
		expect(query?.get("location")).toBe("loc-1");
		expect(query?.has("view")).toBe(false);
	});

	it("writes filter changes to the URL and refetches", async () => {
		const fetch = setup("season=winter");
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);
		await screen.findByText("Navy coat");

		await user.click(screen.getByRole("button", { name: "navy" }));
		expect(nav.replace).toHaveBeenLastCalledWith("/?season=winter&color=navy", {
			scroll: false,
		});
		await user.selectOptions(await screen.findByLabelText("Tag"), "wool");
		expect(nav.replace).toHaveBeenLastCalledWith(
			"/?tag=wool&season=winter&color=navy",
			{ scroll: false },
		);
		// Choosing the active season again clears it.
		await user.click(screen.getByRole("button", { name: "Winter" }));
		expect(nav.get()).toBe("tag=wool&color=navy");

		await waitFor(() => {
			const last = itemQueries(fetch).at(-1);
			expect(last?.get("tag")).toBe("wool");
			expect(last?.get("color")).toBe("navy");
			expect(last?.has("season")).toBe(false);
		});
	});

	it("debounces search into ?q= and removes filters from chips", async () => {
		setup("status=stored");
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);
		await screen.findByText("Navy coat");

		await user.type(screen.getByRole("searchbox", { name: "Search" }), "coat");
		await waitFor(() => expect(nav.get()).toBe("q=coat&status=stored"));
		expect(nav.replace).toHaveBeenCalledTimes(1);

		await user.click(
			screen.getByRole("button", { name: "Remove filter Stored" }),
		);
		expect(nav.get()).toBe("q=coat");
	});

	it("shows an empty state that clears filters", async () => {
		const fetch = setup("color=pink");
		fetch.mockImplementation(async (input) =>
			String(input).startsWith("/api/items")
				? Response.json({ items: [], nextCursor: null })
				: Response.json([]),
		);
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);
		expect(await screen.findByText("No items match")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /Clear filters/ }));
		expect(nav.get()).toBe("");
	});
});
