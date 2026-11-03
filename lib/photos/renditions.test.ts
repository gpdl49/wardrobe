import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
	DISPLAY_EDGE,
	renderRenditions,
	THUMB_EDGE,
	UnsupportedImageError,
} from "@/lib/photos/renditions";
import { largeJpeg, pngImage, rotatedExifJpeg } from "@/test/fixtures/images";

async function pixel(image: Buffer, x: number, y: number) {
	const { data, info } = await sharp(image)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const i = (y * info.width + x) * info.channels;
	return [data[i], data[i + 1], data[i + 2]];
}

describe("renderRenditions", () => {
	it("applies EXIF orientation and strips metadata", async () => {
		const input = await rotatedExifJpeg();
		const before = await sharp(input).metadata();
		expect(before.orientation).toBe(6);
		expect(before.exif).toBeDefined();

		const out = await renderRenditions(input);
		expect([out.width, out.height]).toEqual([100, 200]);

		for (const rendition of [out.display, out.thumb]) {
			const meta = await sharp(rendition).metadata();
			expect(meta.format).toBe("webp");
			expect([meta.width, meta.height]).toEqual([100, 200]);
			expect(meta.orientation).toBeUndefined();
			expect(meta.exif).toBeUndefined();
			expect(meta.xmp).toBeUndefined();
			expect(rendition.includes("secret-owner")).toBe(false);
		}

		// Rotated 90° clockwise: the red left half is now on top.
		const [r, , b] = await pixel(out.display, 50, 20);
		expect(r).toBeGreaterThan(200);
		expect(b).toBeLessThan(60);
		const [r2, , b2] = await pixel(out.display, 50, 180);
		expect(b2).toBeGreaterThan(200);
		expect(r2).toBeLessThan(60);
	});

	it("bounds the longest edge of display and thumb", async () => {
		const out = await renderRenditions(await largeJpeg(3000, 2000));
		expect([out.width, out.height]).toEqual([3000, 2000]);
		const display = await sharp(out.display).metadata();
		const thumb = await sharp(out.thumb).metadata();
		expect([display.width, display.height]).toEqual([DISPLAY_EDGE, 1067]);
		expect([thumb.width, thumb.height]).toEqual([THUMB_EDGE, 267]);
	});

	it("never enlarges small images and encodes a blurhash", async () => {
		const out = await renderRenditions(await pngImage(64, 48));
		const thumb = await sharp(out.thumb).metadata();
		expect([thumb.width, thumb.height]).toEqual([64, 48]);
		// 4x3 components: 1 size char + 4 DC + 2 * (4*3 - 1) AC chars + 1 max = 28.
		expect(out.blurhash).toMatch(/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{28}$/);
	});

	it("rejects undecodable input as unsupported", async () => {
		await expect(
			renderRenditions(new TextEncoder().encode("not an image")),
		).rejects.toBeInstanceOf(UnsupportedImageError);
	});
});
