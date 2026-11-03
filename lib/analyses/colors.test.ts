import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { colorsFromPixels, extractColors } from "@/lib/analyses/colors";

type Rect = { left: number; top: number; width: number; height: number };

/** A PNG of `background` with coloured rectangles drawn on it. */
async function synthetic(
	background: string,
	shapes: (Rect & { color: string })[],
	size = { width: 400, height: 300 },
): Promise<Uint8Array> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">
		<rect width="100%" height="100%" fill="${background}"/>
		${shapes.map((s) => `<rect x="${s.left}" y="${s.top}" width="${s.width}" height="${s.height}" fill="${s.color}"/>`).join("")}
	</svg>`;
	return sharp(Buffer.from(svg)).png().toBuffer();
}

const total = (colors: { share: number }[]) =>
	colors.reduce((sum, c) => sum + c.share, 0);

describe("extractColors", () => {
	it("finds a navy garment on a white background and ignores the background", async () => {
		const image = await synthetic("#ffffff", [
			{ left: 100, top: 60, width: 200, height: 180, color: "#1b2540" },
		]);
		const colors = await extractColors(image);
		expect(colors[0]?.name).toBe("navy");
		expect(colors[0]?.share).toBeGreaterThan(0.9);
		expect(colors.map((c) => c.name)).not.toContain("white");
		expect(colors[0]?.hex).toMatch(/^#[0-9a-f]{6}$/);
		expect(total(colors)).toBeCloseTo(1, 2);
	});

	it("splits a two-tone garment with the right shares", async () => {
		// 2:1 burgundy:cream on a light grey sheet.
		const image = await synthetic("#c9c9c9", [
			{ left: 60, top: 60, width: 200, height: 180, color: "#6b1a2c" },
			{ left: 260, top: 60, width: 100, height: 180, color: "#f2e9d0" },
		]);
		const colors = await extractColors(image);
		expect(colors.map((c) => c.name)).toEqual(["burgundy", "cream"]);
		expect(colors[0]?.share).toBeCloseTo(2 / 3, 1);
		expect(colors[1]?.share).toBeCloseTo(1 / 3, 1);
		expect(total(colors)).toBeCloseTo(1, 2);
	});

	it("keeps garment details that match the background (flood fill, not threshold)", async () => {
		// A white print enclosed by an olive tee on a white background.
		const image = await synthetic("#ffffff", [
			{ left: 80, top: 40, width: 240, height: 220, color: "#5c6a33" },
			{ left: 160, top: 110, width: 80, height: 80, color: "#ffffff" },
		]);
		const colors = await extractColors(image);
		expect(colors[0]?.name).toBe("olive");
		const white = colors.find((c) => c.name === "white");
		expect(white?.share).toBeGreaterThan(0.08);
	});

	it("describes the whole photo when the garment fills the frame", async () => {
		const image = await synthetic("#2c5fbf", []);
		const colors = await extractColors(image);
		expect(colors).toEqual([
			{ name: "blue", hex: expect.any(String), share: 1 },
		]);
	});

	it("falls back to the whole photo when the garment matches the background", async () => {
		const image = await synthetic("#ffffff", [
			{ left: 100, top: 60, width: 200, height: 180, color: "#fbfbfb" },
		]);
		const colors = await extractColors(image);
		expect(colors[0]?.name).toBe("white");
	});

	it("drops colours under the minimum share and renormalises", async () => {
		const image = await synthetic("#ffffff", [
			{ left: 50, top: 50, width: 300, height: 200, color: "#c4232f" },
			// ~2% of the garment: a small black label.
			{ left: 60, top: 60, width: 20, height: 20, color: "#111111" },
		]);
		const colors = await extractColors(image);
		expect(colors.map((c) => c.name)).toEqual(["red"]);
		expect(colors[0]?.share).toBe(1);
	});

	it("is deterministic", async () => {
		const image = await synthetic("#efefef", [
			{ left: 40, top: 40, width: 120, height: 200, color: "#1f4d2f" },
			{ left: 160, top: 40, width: 120, height: 200, color: "#c9a227" },
			{ left: 280, top: 40, width: 60, height: 200, color: "#4b6a8f" },
		]);
		const first = await extractColors(image);
		const second = await extractColors(image);
		expect(second).toEqual(first);
		expect(first.map((c) => c.name).sort()).toEqual([
			"denim",
			"forest green",
			"mustard",
		]);
	});

	it("copes with shading on the garment and a noisy background", async () => {
		// Navy garment lit from one side on a speckled beige carpet.
		const width = 200;
		const height = 150;
		const data = new Uint8Array(width * height * 3);
		let seed = 1;
		const noise = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return (seed / 2 ** 31 - 0.5) * 24;
		};
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const inGarment = x >= 50 && x < 150 && y >= 30 && y < 120;
				const shade = inGarment ? 0.8 + (0.4 * (x - 50)) / 100 : 1;
				const base = inGarment ? [31, 42, 68] : [217, 200, 169];
				const n = inGarment ? 0 : noise();
				data.set(
					base.map((c) => Math.max(0, Math.min(255, c * shade + n))),
					(y * width + x) * 3,
				);
			}
		}
		const image = await sharp(data, { raw: { width, height, channels: 3 } })
			.png()
			.toBuffer();
		const colors = await extractColors(image);
		expect(colors[0]?.name).toBe("navy");
		expect(colors[0]?.share).toBeGreaterThan(0.85);
		expect(colors.map((c) => c.name)).not.toContain("beige");
	});

	it("treats transparent pixels as background", () => {
		// 4x4: transparent border, 2x2 red centre.
		const data = new Uint8Array(4 * 4 * 4);
		for (const [x, y] of [
			[1, 1],
			[2, 1],
			[1, 2],
			[2, 2],
		] as const) {
			data.set([196, 35, 47, 255], (y * 4 + x) * 4);
		}
		const colors = colorsFromPixels({ data, width: 4, height: 4 });
		expect(colors).toEqual([{ name: "red", hex: "#c4232f", share: 1 }]);
	});
});
