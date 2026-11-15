// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { OutfitDetailDto, OutfitPhotoDto } from "@/lib/api/types";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { OutfitDetail } from "./outfit-detail";
import { OutfitList } from "./outfit-list";
import { OutfitImage } from "./outfit-tile";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/client/upload/resize", () => ({
	prepareImage: async (file: Blob) => ({ upload: file }),
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

it("uploads an outfit photo and completes it", async () => {
	const fetch = mockApi({
		"GET /api/outfits/one": { ...outfit, access: "owner" },
		"GET /api/me": { features: { immich: false } },
		"GET /api/shared-with-me": [],
		"POST /api/photos": {
			photo: { id: "photo-1" },
			uploadUrl: "http://localhost/upload",
			uploadHeaders: { "content-type": "image/jpeg" },
		},
		"PUT /upload": new Response(null, { status: 200 }),
		"POST /api/photos/photo-1/complete": {},
	});
	renderWithQuery(<OutfitDetail id="one" />);
	const input = await screen.findByLabelText("Add photo");
	const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
	fireEvent.change(input, { target: { files: [file] } });
	await waitFor(() =>
		expect(
			fetch.mock.calls.some(([url]) =>
				String(url).endsWith("/photo-1/complete"),
			),
		).toBe(true),
	);
	const create = fetch.mock.calls.find(
		([url]) => String(url) === "/api/photos",
	);
	expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({
		outfitId: "one",
		kind: "outfit",
		contentType: "image/jpeg",
		size: file.size,
	});
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

it("filters by a tag that is only used on outfits", async () => {
	const fetch = mockApi({
		"GET /api/me": { features: { suggestions: false } },
		"GET /api/shared-with-me": [],
		"GET /api/tags": [],
		"GET /api/outfits": { outfits: [], nextCursor: null },
		"GET /api/outfits/shared-with-me": [],
	});
	renderWithQuery(<OutfitList />);
	await userEvent.setup().type(screen.getByLabelText("Tag"), "formal");
	await waitFor(() =>
		expect(requests(fetch).some((r) => r.search.includes("tag=formal"))).toBe(
			true,
		),
	);
});
