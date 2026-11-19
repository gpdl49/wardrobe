// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Photo } from "@/components/photo";
import type { PhotoDto } from "@/lib/api/types";

const photo: PhotoDto = {
	id: "photo-1",
	ownerId: "me",
	access: "owner",
	itemId: "item-1",
	outfitId: null,
	kind: "main",
	status: "ready",
	backgroundStatus: null,
	contentType: "image/jpeg",
	size: 100,
	width: 50,
	height: 50,
	blurhash: null,
	createdAt: "2026-11-19T10:00:00Z",
	urls: { original: "/original", display: "/display", thumb: "/thumb" },
};

afterEach(cleanup);

describe("Photo", () => {
	it("fills the tile with an ordinary photo", () => {
		render(<Photo photo={photo} variant="thumb" alt="shirt" />);
		expect(screen.getByAltText("shirt")).toHaveClass("object-cover");
	});

	it("shows the whole garment in a cropped cutout", () => {
		render(
			<Photo
				photo={{ ...photo, backgroundStatus: "ready" }}
				variant="thumb"
				alt="shirt"
			/>,
		);
		expect(screen.getByAltText("shirt")).toHaveClass("object-contain");
	});

	it("treats a back photo's cutout the same way", () => {
		render(
			<Photo
				photo={{ ...photo, kind: "back", backgroundStatus: "ready" }}
				variant="thumb"
				alt="shirt"
			/>,
		);
		expect(screen.getByAltText("shirt")).toHaveClass("object-contain");
	});
});
