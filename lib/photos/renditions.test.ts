import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
	DISPLAY_EDGE,
	renderCutoutRenditions,
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

	it("keeps a main photo with an uncertain mask opaque", async () => {
		const plain = await sharp({
			create: { width: 320, height: 320, channels: 3, background: "#eee" },
		})
			.png()
			.toBuffer();
		await expect(renderCutoutRenditions(plain)).resolves.toBeNull();
	});

	it("keeps existing transparency", async () => {
		const transparent = await sharp({
			create: {
				width: 64,
				height: 64,
				channels: 4,
				background: { r: 220, g: 225, b: 230, alpha: 0.5 },
			},
		})
			.png()
			.toBuffer();
		await expect(renderCutoutRenditions(transparent)).resolves.toBeNull();
		const { display } = await renderRenditions(transparent);
		const rgba = await sharp(display).raw().toBuffer();
		expect(rgba[3]).toBe(128);
	});

	it("makes a white backdrop transparent around a white shirt", async () => {
		// Paulinaela, CC0, https://commons.wikimedia.org/wiki/File:White-tshirt.jpg
		const original = await readFile(
			new URL("../../test/fixtures/white-shirt.jpg", import.meta.url),
		);
		const cutout = await renderCutoutRenditions(original);
		expect(cutout).not.toBeNull();
		if (!cutout) throw new Error("Expected a cutout");
		for (const image of [cutout.display, cutout.thumb]) {
			const { data, info } = await sharp(image)
				.raw()
				.toBuffer({ resolveWithObject: true });
			expect(info.channels).toBe(4);
			expect(data[3]).toBe(0);
			const center =
				(Math.floor(info.height / 2) * info.width +
					Math.floor(info.width / 2)) *
				4;
			expect(data[center + 3]).toBe(255);
			expect(data[center]).toBeGreaterThan(200);
		}
	}, 15_000);

	it("rejects undecodable input as unsupported", async () => {
		await expect(
			renderRenditions(new TextEncoder().encode("not an image")),
		).rejects.toBeInstanceOf(UnsupportedImageError);
	});
});
