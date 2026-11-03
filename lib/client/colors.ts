import { PALETTE } from "@/lib/analyses/palette";

/**
 * Colour swatches for the catalogue filter: the colour analysis palette, so
 * the names are exactly what `Item.colors[].name` holds and what
 * `GET /api/items?color=` matches.
 */
export const COLOR_SWATCHES = PALETTE;

export function swatchHex(name: string): string | undefined {
	return COLOR_SWATCHES.find((s) => s.name === name)?.hex;
}

/** True for light colours that need a visible border on a light surface. */
export function isLight(hex: string): boolean {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!m) {
		return false;
	}
	const [r, g, b] = [m[1], m[2], m[3]].map((v) =>
		Number.parseInt(v ?? "0", 16),
	);
	return 0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0) > 200;
}
