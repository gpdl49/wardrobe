import SwiftUI
import WardrobeKit

/// WP10 replaces this shell with the suggestion screen.
struct OutfitSuggestView: View {
	var body: some View {
		ContentUnavailableView("Suggestions", systemImage: "sparkles").navigationTitle("Suggest")
	}
}
