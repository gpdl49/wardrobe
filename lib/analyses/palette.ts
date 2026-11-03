import { deltaE2000, hexToLab, type Lab } from "@/lib/analyses/color-space";

/**
 * Curated clothing palette: the names a person would use for a garment,
 * with a typical swatch each. Extracted colours are named by their nearest
 * entry (CIEDE2000). Names are what the catalogue filters by, so keep them
 * stable; tune hexes rather than renaming.
 */
export const PALETTE = [
	// Neutrals
	{ name: "black", hex: "#141414" },
	{ name: "charcoal", hex: "#3a3b3d" },
	{ name: "grey", hex: "#808080" },
	{ name: "light grey", hex: "#c4c4c4" },
	{ name: "white", hex: "#f7f7f5" },
	{ name: "cream", hex: "#f1e9d2" },
	{ name: "beige", hex: "#d9c8a9" },
	{ name: "taupe", hex: "#8b7d6b" },
	// Browns
	{ name: "tan", hex: "#c19a6b" },
	{ name: "camel", hex: "#b5835a" },
	{ name: "khaki", hex: "#a8996a" },
	{ name: "brown", hex: "#6f4e37" },
	{ name: "chocolate", hex: "#3f2a1d" },
	{ name: "rust", hex: "#a7472a" },
	// Warm
	{ name: "orange", hex: "#e8762b" },
	{ name: "coral", hex: "#f0806a" },
	{ name: "mustard", hex: "#c9a227" },
	{ name: "yellow", hex: "#f2d33a" },
	// Greens
	{ name: "olive", hex: "#5f6b35" },
	{ name: "sage", hex: "#9caf88" },
	{ name: "mint", hex: "#a8e0c4" },
	{ name: "green", hex: "#3c8d4b" },
	{ name: "forest green", hex: "#1f4d2f" },
	{ name: "teal", hex: "#1d7373" },
	{ name: "turquoise", hex: "#3fc1c0" },
	// Blues
	{ name: "light blue", hex: "#9ec9e8" },
	{ name: "blue", hex: "#2c5fbf" },
	{ name: "denim", hex: "#4b6a8f" },
	{ name: "navy", hex: "#1f2a44" },
	// Purples
	{ name: "lavender", hex: "#b9a7d6" },
	{ name: "purple", hex: "#6a3d9a" },
	{ name: "plum", hex: "#5e2750" },
	// Reds and pinks
	{ name: "burgundy", hex: "#6d1a2c" },
	{ name: "red", hex: "#c4232f" },
	{ name: "pink", hex: "#f2a7bc" },
	{ name: "blush", hex: "#e8c4bd" },
	{ name: "fuchsia", hex: "#d6337f" },
] as const satisfies readonly { name: string; hex: string }[];

export type PaletteName = (typeof PALETTE)[number]["name"];

const PALETTE_LAB = PALETTE.map((entry) => ({
	...entry,
	lab: hexToLab(entry.hex),
}));

export type PaletteMatch = { name: PaletteName; hex: string; distance: number };

/** The nearest palette entry to a Lab colour. */
export function nearestPaletteColor(lab: Lab): PaletteMatch {
	let best: PaletteMatch | undefined;
	for (const entry of PALETTE_LAB) {
		const distance = deltaE2000(lab, entry.lab);
		if (!best || distance < best.distance) {
			best = { name: entry.name, hex: entry.hex, distance };
		}
	}
	// PALETTE is a non-empty constant.
	return best as PaletteMatch;
}

export const nameColor = (hex: string): PaletteName =>
	nearestPaletteColor(hexToLab(hex)).name;
