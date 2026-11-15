// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { OutfitDetailDto, OutfitPhotoDto } from "@/lib/api/types";
import { mockApi, renderWithQuery } from "@/test/helpers/dom";
import { OutfitDetail } from "./outfit-detail";
import { OutfitImage } from "./outfit-tile";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
const photo: OutfitPhotoDto = {
	id: "link",
	source: "immich",
	status: "ready",
	width: null,
	height: null,
	blurhash: null,
	thumbhash: null,
	assetId: "asset",
	takenAt: null,
	createdAt: "2026-01-01",
	urls: { thumb: "/thumb", display: "/display" },
};
const outfit: OutfitDetailDto = {
	id: "one",
	ownerId: "owner",
	owner: { id: "owner", username: "owner", email: null },
	access: "view",
	name: "Weekend",
	notes: null,
	seasons: [],
	tags: [],
	itemCount: 0,
	previewItems: [],
	cover: null,
	createdAt: "2026-01-01",
	updatedAt: "2026-01-01",
	items: [],
	readableItemIds: [],
	photos: [photo],
	shares: [],
};
it("shows a placeholder when an Immich image fails", () => {
	renderWithQuery(<OutfitImage photo={photo} alt="Outfit photo" />);
	fireEvent.error(screen.getByRole("img"));
	expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
});
it("hides write controls for a viewer", async () => {
	mockApi({ "GET /api/outfits/one": outfit });
	renderWithQuery(<OutfitDetail id="one" />);
	await screen.findByRole("heading", { name: "Weekend" });
	expect(screen.queryByText("Edit")).not.toBeInTheDocument();
	expect(screen.queryByText("Share")).not.toBeInTheDocument();
	expect(screen.queryByText("Remove photo")).not.toBeInTheDocument();
});

it("sends outfit filters to the list API", async () => {
	const { outfits } = await import("@/lib/client/outfits");
	const fetch = mockApi({
		"GET /api/outfits": { outfits: [], nextCursor: null },
	});
	await outfits.list({
		owner: "other",
		item: "item-1",
		tag: "wool",
		season: "winter",
		q: "coat",
	});
	const url = new URL(String(fetch.mock.calls[0]?.[0]), "http://localhost");
	expect(Object.fromEntries(url.searchParams)).toEqual({
		owner: "other",
		item: "item-1",
		tag: "wool",
		season: "winter",
		q: "coat",
	});
});
