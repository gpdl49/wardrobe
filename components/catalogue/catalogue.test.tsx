// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoDto } from "@/lib/api/types";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { analysis, itemDetail, location } from "@/test/helpers/factories";

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

function setup(search: string, routes: Parameters<typeof mockApi>[0] = {}) {
	act(() => nav.set(`/?${search}`));
	nav.replace.mockClear();
	return mockApi({
		"GET /api/locations": [location({ id: "loc-1", code: "B-01" })],
		"GET /api/categories": [],
		"GET /api/tags": [{ name: "wool", count: 3 }],
		"GET /api/items": {
			items: [itemDetail({ id: "i1" })],
			nextCursor: null,
		},
		...routes,
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

const coat = itemDetail({ id: "i1" });
const shirt = itemDetail({ id: "i2", name: "White shirt", access: "edit" });
const jeans = itemDetail({ id: "i3", name: "Blue jeans", access: "view" });
const catalogueItems = { items: [coat, shirt, jeans], nextCursor: null };

function photo(id: string, overrides: Partial<PhotoDto> = {}): PhotoDto {
	return {
		id,
		ownerId: coat.ownerId,
		access: coat.access,
		itemId: coat.id,
		outfitId: null,
		kind: "main",
		status: "ready",
		contentType: "image/jpeg",
		size: 100,
		width: 50,
		height: 50,
		blurhash: null,
		createdAt: coat.createdAt,
		urls: { original: "/original", display: "/display", thumb: "/thumb" },
		...overrides,
	};
}

describe("catalogue selection", () => {
	it("selects editable items across views and clears selection when filters change", async () => {
		setup("group=category", { "GET /api/items": catalogueItems });
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);

		expect(
			await screen.findByRole("link", { name: /Navy coat/ }),
		).toHaveAttribute("href", "/items/i1");
		await user.click(screen.getByRole("button", { name: "Select items" }));
		await user.click(
			screen.getByRole("checkbox", { name: "Select Navy coat" }),
		);
		expect(screen.getByText("1 selected")).toBeInTheDocument();
		expect(
			screen.queryByRole("checkbox", { name: "Select Blue jeans" }),
		).toBeNull();

		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(
			screen.getByRole("checkbox", { name: "Select Navy coat" }),
		).toBeChecked();
		await user.click(screen.getByRole("button", { name: "Select all loaded" }));
		expect(
			screen.getByRole("checkbox", { name: "Select White shirt" }),
		).toBeChecked();
		expect(screen.getByText("2 selected")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Clear selection" }));
		expect(screen.getByRole("button", { name: "Run action" })).toBeDisabled();

		await user.click(
			screen.getByRole("checkbox", { name: "Select Navy coat" }),
		);
		await user.click(screen.getByRole("button", { name: "Winter" }));
		expect(
			await screen.findByRole("button", { name: "Select items" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("checkbox", { name: "Select Navy coat" }),
		).toBeNull();
	});

	it("queues eligible front and back photos and reports partial failures", async () => {
		const main = photo("main");
		const back = photo("back", { kind: "back", backgroundStatus: "failed" });
		const fetch = setup("", {
			"GET /api/items": catalogueItems,
			"GET /api/items/i1": {
				...coat,
				photos: [
					main,
					back,
					photo("label", { kind: "label" }),
					photo("queued", { backgroundStatus: "queued" }),
					photo("pending", { status: "pending" }),
				],
			},
			"GET /api/items/i2": shirt,
			"POST /api/photos/main/background": () =>
				Response.json(
					{ error: "conflict", message: "Wait until the photo is ready" },
					{ status: 409 },
				),
			"POST /api/photos/back/background": {
				...back,
				backgroundStatus: "queued",
			},
		});
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);
		await user.click(
			await screen.findByRole("button", { name: "Select items" }),
		);
		await user.click(screen.getByRole("button", { name: "Select all loaded" }));
		await user.selectOptions(screen.getByLabelText("Action"), "backgrounds");
		expect(requests(fetch).filter((r) => r.method === "POST")).toEqual([]);
		await user.click(screen.getByRole("button", { name: "Run action" }));

		expect(
			await screen.findByText("0 queued · 1 skipped · 1 failed"),
		).toBeInTheDocument();
		expect(
			screen.getByText(/Wait until the photo is ready/),
		).toBeInTheDocument();
		expect(
			requests(fetch)
				.filter((r) => r.method === "POST")
				.map((r) => r.path),
		).toEqual(["/api/photos/main/background", "/api/photos/back/background"]);
		expect(requests(fetch).some((r) => r.path === "/api/items/i3")).toBe(false);
	});

	it("applies the latest completed suggestion for each field to the selected items", async () => {
		const fetch = setup("", {
			"GET /api/items": catalogueItems,
			"GET /api/items/i1": {
				...coat,
				analyses: [
					analysis({ id: "pending", status: "queued" }),
					analysis({
						id: "latest-tags",
						result: { tags: ["wool"], brand: "Acme" },
					}),
					analysis({
						id: "latest-colours",
						kind: "colors",
						result: { colors: [{ name: "navy", hex: "#202050", share: 1 }] },
					}),
					analysis({ id: "old-tags", result: { tags: ["cotton"] } }),
				],
			},
			"GET /api/items/i2": shirt,
			"POST /api/items/i1/analyses/latest-tags/apply": coat,
			"POST /api/items/i1/analyses/latest-colours/apply": coat,
		});
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);
		await user.click(
			await screen.findByRole("button", { name: "Select items" }),
		);
		await user.click(screen.getByRole("button", { name: "Select all loaded" }));
		await user.selectOptions(screen.getByLabelText("Action"), "suggestions");
		await user.click(screen.getByRole("button", { name: "Run action" }));

		expect(
			await screen.findByText("1 updated · 1 skipped · 0 failed"),
		).toBeInTheDocument();
		expect(
			requests(fetch)
				.filter((r) => r.method === "POST")
				.map(({ path, body }) => [path, body]),
		).toEqual([
			["/api/items/i1/analyses/latest-tags/apply", { fields: ["tags"] }],
			["/api/items/i1/analyses/latest-colours/apply", { fields: ["colors"] }],
		]);
	});

	it("reruns analysis for selected ready items and skips analysis in progress", async () => {
		const fetch = setup("", {
			"GET /api/items": catalogueItems,
			"GET /api/items/i1": { ...coat, photos: [photo("main")] },
			"GET /api/items/i2": {
				...shirt,
				photos: [photo("other", { itemId: shirt.id })],
				analyses: [analysis({ status: "running" })],
			},
			"POST /api/items/i1/analyses": [analysis({ status: "queued" })],
		});
		const user = userEvent.setup();
		renderWithQuery(<Catalogue />);
		await user.click(
			await screen.findByRole("button", { name: "Select items" }),
		);
		await user.click(screen.getByRole("button", { name: "Select all loaded" }));
		await user.selectOptions(screen.getByLabelText("Action"), "analysis");
		await user.click(screen.getByRole("button", { name: "Run action" }));

		expect(
			await screen.findByText("1 queued · 1 skipped · 0 failed"),
		).toBeInTheDocument();
		expect(
			requests(fetch)
				.filter((r) => r.method === "POST")
				.map((r) => r.path),
		).toEqual(["/api/items/i1/analyses"]);
	});
});
