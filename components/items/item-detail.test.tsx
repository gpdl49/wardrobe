// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Access } from "@/lib/api/types";
import { mockApi, renderWithQuery } from "@/test/helpers/dom";
import { analysis, itemDetail } from "@/test/helpers/factories";
import { ItemDetail, tagHref } from "./item-detail";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

const show = async (access: Access) => {
	mockApi({
		"GET /api/items/item-1": itemDetail({
			access,
			analyses: [
				analysis({ status: "done", result: { brand: "Acme", size: "M" } }),
			],
		}),
		"GET /api/categories": [],
	});
	renderWithQuery(<ItemDetail id="item-1" />);
	await screen.findByRole("heading", { name: "Navy coat", level: 1 });
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ItemDetail controls", () => {
	it("hides every write for view access", async () => {
		await show("view");
		for (const name of [
			"Edit",
			"Delete item",
			/Re-run analysis/,
			"Accept Brand",
			/Accept all/,
		]) {
			expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
		}
		expect(screen.getByText("Acme")).toBeInTheDocument();
	});

	it.each(["edit", "owner"] as const)(
		"shows them for %s access",
		async (access) => {
			await show(access);
			for (const name of [
				"Edit",
				"Delete item",
				/Re-run analysis/,
				"Accept Brand",
				/Accept all/,
			]) {
				expect(screen.getByRole("button", { name })).toBeInTheDocument();
			}
		},
	);
});

describe("tagHref", () => {
	it("stays in your wardrobe for your own item", () => {
		expect(tagHref({ ownerId: "me" }, "wool", "me")).toBe("/?tag=wool");
	});

	it("filters the owner's wardrobe for a shared item", () => {
		expect(tagHref({ ownerId: "anna" }, "wool", "me")).toBe(
			"/?owner=anna&tag=wool",
		);
	});
});
