// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedWithMeDto } from "@/lib/api/types";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { location } from "@/test/helpers/factories";
import { LocationsList } from "./locations-list";

const nav = vi.hoisted(() => ({
	search: "",
	replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	usePathname: () => "/locations",
	useRouter: () => ({ replace: nav.replace }),
	useSearchParams: () => new URLSearchParams(nav.search),
}));

const anna = { id: "anna", email: null, username: "anna" };
const share = (access: "view" | "edit", whole: boolean): SharedWithMeDto => ({
	id: "s",
	owner: anna,
	access,
	location: whole ? null : { id: "x", code: "x", name: "x" },
});

const show = (shared: SharedWithMeDto[]) => {
	const fetch = mockApi({
		"GET /api/locations": [location()],
		"GET /api/shared-with-me": shared,
	});
	renderWithQuery(<LocationsList />);
	return fetch;
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	nav.search = "";
	nav.replace.mockClear();
});

describe("LocationsList", () => {
	it("shows your own wardrobe by default, with New location", async () => {
		const fetch = show([]);
		await screen.findByText("B-01");
		expect(
			screen.getByRole("button", { name: "New location" }),
		).toBeInTheDocument();
		const list = requests(fetch).find((r) => r.path === "/api/locations");
		expect(list?.search).toBe("");
	});

	it("follows the owner in the URL", async () => {
		nav.search = "owner=anna";
		const fetch = show([share("view", true)]);
		await screen.findByText("B-01");
		const list = requests(fetch).find((r) => r.path === "/api/locations");
		expect(list?.search).toContain("owner=anna");
	});

	it("switches wardrobe through the URL", async () => {
		show([share("view", true)]);
		const user = userEvent.setup();
		await screen.findByRole("option", { name: "anna's wardrobe" });
		await user.selectOptions(screen.getByRole("combobox"), "anna");
		expect(nav.replace).toHaveBeenCalledWith("/locations?owner=anna", {
			scroll: false,
		});
	});

	it.each([
		["a view share", share("view", true)],
		["a location share", share("edit", false)],
	])("hides New location with %s", async (_name, shared) => {
		nav.search = "owner=anna";
		show([shared]);
		await screen.findByRole("combobox");
		expect(
			screen.queryByRole("button", { name: "New location" }),
		).not.toBeInTheDocument();
	});

	it("offers New location with a whole-wardrobe edit share", async () => {
		nav.search = "owner=anna";
		show([share("edit", true)]);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "New location" }),
			).toBeInTheDocument(),
		);
	});
});
