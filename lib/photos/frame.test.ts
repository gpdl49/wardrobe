import { describe, expect, it } from "vitest";
import { FRAME_ASPECT, FRAME_MARGIN, garmentFrame } from "@/lib/photos/frame";

/** A `size`×`size` mask with an opaque rectangle. */
function mask(
	size: number,
	box: { x: number; y: number; width: number; height: number },
) {
	const data = new Uint8Array(size * size);
	for (let y = box.y; y < box.y + box.height; y++) {
		data.fill(255, y * size + box.x, y * size + box.x + box.width);
	}
	return data;
}

describe("garmentFrame", () => {
	it("frames a tall garment with an even margin at 4:5", () => {
		// 40×80 garment centred at (50, 50) on a 100×100 mask and image.
		const frame = garmentFrame(
			mask(100, { x: 30, y: 10, width: 40, height: 80 }),
			100,
			100,
			100,
			100,
		);
		const height = 80 * (1 + 2 * FRAME_MARGIN);
		expect(frame).toEqual({
			left: Math.round(50 - (height * FRAME_ASPECT) / 2),
			top: Math.round(50 - height / 2),
			width: Math.round(height * FRAME_ASPECT),
			height: Math.round(height),
		});
	});

	it("grows the height of a wide garment, past the image if needed", () => {
		const frame = garmentFrame(
			mask(100, { x: 0, y: 40, width: 100, height: 20 }),
			100,
			100,
			100,
			100,
		);
		expect(frame?.width).toBe(112);
		expect(frame?.height).toBe(140);
		expect(frame?.left).toBe(-6);
		expect(frame?.top).toBe(-20);
	});

	it("maps a square mask onto a non-square image", () => {
		const frame = garmentFrame(
			mask(10, { x: 0, y: 0, width: 10, height: 10 }),
			10,
			10,
			400,
			500,
		);
		// 400×500 plus 30 px margins is 460×560, then 575 tall for 4:5.
		expect(frame).toEqual({ left: -30, top: -37, width: 460, height: 575 });
	});

	it("ignores stray pixels and returns null for an empty mask", () => {
		const data = mask(100, { x: 30, y: 10, width: 40, height: 80 });
		data[99] = 255; // a lone speck in the top-right corner
		expect(garmentFrame(data, 100, 100, 100, 100)?.left).toBeGreaterThan(0);
		expect(garmentFrame(new Uint8Array(100), 10, 10, 10, 10)).toBeNull();
	});
});
