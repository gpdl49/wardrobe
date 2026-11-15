import SwiftUI
import WardrobeKit

/// Entry point for WP8's outfit list.
struct OutfitsView: View {
	var body: some View {
		ContentUnavailableView(
			"Outfits", systemImage: "square.stack.3d.up",
			description: Text("Your outfits will appear here.")
		).navigationTitle("Outfits")
	}
}

/// WP8 replaces this shell with the outfit detail.
struct OutfitDetailView: View {
	let outfitId: ID
	var body: some View { ContentUnavailableView("Outfit", systemImage: "tshirt") }
}
