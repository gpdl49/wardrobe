// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Access, PhotoDto } from "@/lib/api/types";
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

const mainPhoto: PhotoDto = {
	id: "photo-1",
	ownerId: "me",
	access: "owner",
	itemId: "item-1",
	outfitId: null,
	kind: "main",
	status: "ready",
	contentType: "image/jpeg",
	size: 100,
	width: 50,
	height: 50,
	blurhash: null,
	createdAt: "2026-11-19T10:00:00Z",
	urls: { original: "/original", display: "/display", thumb: "/thumb" },
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ItemDetail controls", () => {
	it("queues background removal only when the editor clicks and displays the queued state", async () => {
		let photo = mainPhoto;
		const queue = vi.fn(() => {
			photo = { ...photo, backgroundStatus: "queued" };
			return Response.json(photo, { status: 202 });
		});
		mockApi({
			"GET /api/items/item-1": () => itemDetail({ photos: [photo] }),
			"POST /api/photos/photo-1/background": queue,
		});
		renderWithQuery(<ItemDetail id="item-1" />);
		const button = await screen.findByRole("button", {
			name: "Remove background",
		});
		expect(queue).not.toHaveBeenCalled();
		await userEvent.click(button);
		expect(
			await screen.findByRole("button", { name: "Removing background…" }),
		).toBeDisabled();
		expect(queue).toHaveBeenCalledTimes(1);
	});

	it("offers to try a skipped photo again", async () => {
		const queue = vi.fn(() =>
			Response.json(
				{ ...mainPhoto, backgroundStatus: "queued" },
				{ status: 202 },
			),
		);
		mockApi({
			"GET /api/items/item-1": () =>
				itemDetail({ photos: [{ ...mainPhoto, backgroundStatus: "skipped" }] }),
			"POST /api/photos/photo-1/background": queue,
		});
		renderWithQuery(<ItemDetail id="item-1" />);
		expect(
			await screen.findByText("Couldn’t isolate the garment"),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(queue).toHaveBeenCalledTimes(1);
	});

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
