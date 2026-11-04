// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Access, SharedWithMeDto } from "@/lib/api/types";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { location } from "@/test/helpers/factories";
import { LocationDetail } from "./location-detail";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const owner = { id: "anna", email: null, username: "anna" };

const show = async (
	access: Access,
	shared: SharedWithMeDto[] = [],
	ownerId = "anna",
) => {
	const fetch = mockApi({
		"GET /api/locations/loc-1": {
			...location({ access, ownerId }),
			items: [],
			children: [],
		},
		"GET /api/locations": [],
		"GET /api/shared-with-me": shared,
	});
	renderWithQuery(<LocationDetail id="loc-1" />);
	await screen.findAllByRole("heading", { level: 1 });
	// Let the share list arrive.
	await new Promise((resolve) => setTimeout(resolve, 0));
	return fetch;
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("LocationDetail controls", () => {
	it("hides every write for view access, keeping print", async () => {
		await show("view");
		for (const name of [/Move all/, "Edit", "Add inside", "Delete"]) {
			expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
		}
		expect(
			screen.getByRole("button", { name: "Print contents" }),
		).toBeInTheDocument();
	});

	it("shows everything to the owner", async () => {
		await show("owner");
		for (const name of [/Move all/, "Edit", "Add inside", "Delete"]) {
			expect(screen.getByRole("button", { name })).toBeInTheDocument();
		}
	});

	it("hides delete on the location that was shared with you", async () => {
		await show("edit", [
			{
				id: "s",
				owner,
				access: "edit",
				location: { id: "loc-1", code: "B-01", name: "Bag" },
			},
		]);
		expect(
			await screen.findByRole("button", { name: "Edit" }),
		).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(
				screen.queryByRole("button", { name: "Delete" }),
			).not.toBeInTheDocument(),
		);
	});

	it("looks up other locations in the owner's wardrobe", async () => {
		const fetch = await show("edit");
		expect(
			requests(fetch).some(
				(r) => r.path === "/api/locations" && r.search.includes("owner=anna"),
			),
		).toBe(true);
	});
});
