/**
 * Auto-cropping for background cutouts: frame the garment found in a
 * foreground mask, with an even margin, at the catalogue tile's 4:5 shape.
 */

/** Mask values at or above this count as garment when framing. */
const OPAQUE = 128;
/** Rows or columns with fewer garment pixels are treated as mask noise. */
const MIN_RUN = 2;
/** Margin on every side, as a share of the garment's longer side. */
export const FRAME_MARGIN = 0.06;
/** Width / height of the frame, matching the catalogue tiles. */
export const FRAME_ASPECT = 4 / 5;

/** A rectangle in image pixels; it may extend past the image's edges. */
export type Frame = {
	left: number;
	top: number;
	width: number;
	height: number;
};

function span(counts: Uint32Array): [number, number] | null {
	const first = counts.findIndex((count) => count >= MIN_RUN);
	if (first < 0) return null;
	return [first, counts.findLastIndex((count) => count >= MIN_RUN)];
}

/**
 * Frames the garment in `mask` (`maskWidth`×`maskHeight`, one byte per pixel,
 * stretched over a `width`×`height` image): its bounding box plus
 * FRAME_MARGIN, grown about its centre to FRAME_ASPECT. Null without a garment.
 */
export function garmentFrame(
	mask: Uint8Array,
	maskWidth: number,
	maskHeight: number,
	width: number,
	height: number,
): Frame | null {
	const rows = new Uint32Array(maskHeight);
	const columns = new Uint32Array(maskWidth);
	for (let y = 0; y < maskHeight; y++) {
		for (let x = 0; x < maskWidth; x++) {
			if ((mask[y * maskWidth + x] as number) >= OPAQUE) {
				rows[y] = (rows[y] as number) + 1;
				columns[x] = (columns[x] as number) + 1;
			}
		}
	}
	const vertical = span(rows);
	const horizontal = span(columns);
	if (!vertical || !horizontal) return null;

	const scaleX = width / maskWidth;
	const scaleY = height / maskHeight;
	const left = horizontal[0] * scaleX;
	const right = (horizontal[1] + 1) * scaleX;
	const top = vertical[0] * scaleY;
	const bottom = (vertical[1] + 1) * scaleY;
	const margin = FRAME_MARGIN * Math.max(right - left, bottom - top);
	let frameWidth = right - left + 2 * margin;
	let frameHeight = bottom - top + 2 * margin;
	if (frameWidth / frameHeight < FRAME_ASPECT) {
		frameWidth = frameHeight * FRAME_ASPECT;
	} else {
		frameHeight = frameWidth / FRAME_ASPECT;
	}
	frameWidth = Math.round(frameWidth);
	frameHeight = Math.round(frameHeight);
	return {
		left: Math.round((left + right - frameWidth) / 2),
		top: Math.round((top + bottom - frameHeight) / 2),
		width: frameWidth,
		height: frameHeight,
	};
}
