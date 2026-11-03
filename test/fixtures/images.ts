import sharp from "sharp";

/**
 * Small generated images for photo tests: left half red, right half blue,
 * so a test can tell which way an image was rotated.
 */
export async function twoTone(width: number, height: number) {
	const half = Math.floor(width / 2);
	return sharp({
		create: { width, height, channels: 3, background: "#ff0000" },
	}).composite([
		{
			input: {
				create: {
					width: width - half,
					height,
					channels: 3,
					background: "#0000ff",
				},
			},
			left: half,
			top: 0,
		},
	]);
}

/** A JPEG stored 200x100 with EXIF orientation 6 (display rotated 90° CW) and a copyright tag. */
export async function rotatedExifJpeg(): Promise<Buffer> {
	const flat = await (await twoTone(200, 100)).jpeg().toBuffer();
	return sharp(flat)
		.withMetadata({ orientation: 6 })
		.withExif({ IFD0: { Copyright: "secret-owner" } })
		.jpeg({ quality: 90 })
		.toBuffer();
}

export async function pngImage(width = 64, height = 48): Promise<Buffer> {
	return (await twoTone(width, height)).png().toBuffer();
}

export async function largeJpeg(width = 3000, height = 2000): Promise<Buffer> {
	return (await twoTone(width, height)).jpeg().toBuffer();
}
