import { describe, expect, it } from "vitest";
import { photoUrl, toPhotoDto } from "@/lib/photos/present";

describe("toPhotoDto", () => {
	it("serialises dates and builds variant urls", () => {
		const at = new Date("2026-11-03T10:00:00Z");
		const dto = toPhotoDto({
			id: "p1",
			itemId: null,
			kind: "main",
			status: "ready",
			contentType: "image/jpeg",
			size: 10,
			width: 1,
			height: 2,
			blurhash: null,
			createdAt: at,
			updatedAt: at,
		});
		expect(dto.createdAt).toBe("2026-11-03T10:00:00.000Z");
		expect(dto.urls.thumb).toBe(photoUrl("p1", "thumb"));
		expect(dto.urls.original).toBe("/api/photos/p1/original");
	});
});
