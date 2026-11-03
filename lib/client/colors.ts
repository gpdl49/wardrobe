/**
 * Colour swatches for the catalogue filter. The names are what the colour
 * analysis writes into `Item.colors[].name` and what `GET /api/items?color=`
 * matches; the hex values are only for drawing the swatch.
 */
export const COLOR_SWATCHES = [
	{ name: "black", hex: "#111111" },
	{ name: "grey", hex: "#8a8a8a" },
	{ name: "white", hex: "#f5f5f5" },
	{ name: "cream", hex: "#efe6d2" },
	{ name: "beige", hex: "#d6c3a0" },
	{ name: "brown", hex: "#6f4a2f" },
	{ name: "navy", hex: "#1f2a4a" },
	{ name: "blue", hex: "#2f6ad9" },
	{ name: "teal", hex: "#1f8a8a" },
	{ name: "green", hex: "#3d8a4a" },
	{ name: "olive", hex: "#6b6b2f" },
	{ name: "yellow", hex: "#e8c531" },
	{ name: "orange", hex: "#e2792f" },
	{ name: "red", hex: "#c8312f" },
	{ name: "burgundy", hex: "#6e1f2f" },
	{ name: "pink", hex: "#e8a0b8" },
	{ name: "purple", hex: "#6e3fa0" },
] as const;

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
