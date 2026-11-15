import Foundation

/// Curated clothing colour palette (matches lib/analyses/palette.ts).
struct PaletteColor: Identifiable, Hashable, Sendable {
	let name: String
	let hex: String
	var id: String { name }

	var isLight: Bool {
		let clean = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
		guard clean.count == 6, let v = UInt32(clean, radix: 16) else { return false }
		let r = Double((v >> 16) & 0xff)
		let g = Double((v >> 8) & 0xff)
		let b = Double(v & 0xff)
		return 0.299 * r + 0.587 * g + 0.114 * b > 200
	}
}

enum Palette {
	static let colors: [PaletteColor] = [
		// Neutrals
		PaletteColor(name: "black", hex: "#141414"),
		PaletteColor(name: "charcoal", hex: "#3a3b3d"),
		PaletteColor(name: "grey", hex: "#808080"),
		PaletteColor(name: "light grey", hex: "#c4c4c4"),
		PaletteColor(name: "white", hex: "#f7f7f5"),
		PaletteColor(name: "cream", hex: "#f1e9d2"),
		PaletteColor(name: "beige", hex: "#d9c8a9"),
		PaletteColor(name: "taupe", hex: "#8b7d6b"),
		// Browns
		PaletteColor(name: "tan", hex: "#c19a6b"),
		PaletteColor(name: "camel", hex: "#b5835a"),
		PaletteColor(name: "khaki", hex: "#a8996a"),
		PaletteColor(name: "brown", hex: "#6f4e37"),
		PaletteColor(name: "chocolate", hex: "#3f2a1d"),
		PaletteColor(name: "rust", hex: "#a7472a"),
		// Warm
		PaletteColor(name: "orange", hex: "#e8762b"),
		PaletteColor(name: "coral", hex: "#f0806a"),
		PaletteColor(name: "mustard", hex: "#c9a227"),
		PaletteColor(name: "yellow", hex: "#f2d33a"),
		// Greens
		PaletteColor(name: "olive", hex: "#5f6b35"),
		PaletteColor(name: "sage", hex: "#9caf88"),
		PaletteColor(name: "mint", hex: "#a8e0c4"),
		PaletteColor(name: "green", hex: "#3c8d4b"),
		PaletteColor(name: "forest green", hex: "#1f4d2f"),
		PaletteColor(name: "teal", hex: "#1d7373"),
		PaletteColor(name: "turquoise", hex: "#3fc1c0"),
		// Blues
		PaletteColor(name: "light blue", hex: "#9ec9e8"),
		PaletteColor(name: "blue", hex: "#2c5fbf"),
		PaletteColor(name: "denim", hex: "#4b6a8f"),
		PaletteColor(name: "navy", hex: "#1f2a44"),
		// Purples
		PaletteColor(name: "lavender", hex: "#b9a7d6"),
		PaletteColor(name: "purple", hex: "#6a3d9a"),
		PaletteColor(name: "plum", hex: "#5e2750"),
		// Reds and pinks
		PaletteColor(name: "burgundy", hex: "#6d1a2c"),
		PaletteColor(name: "red", hex: "#c4232f"),
		PaletteColor(name: "pink", hex: "#f2a7bc"),
		PaletteColor(name: "blush", hex: "#e8c4bd"),
		PaletteColor(name: "fuchsia", hex: "#d6337f"),
	]
}
