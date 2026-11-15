import SwiftUI
import WardrobeKit

/// Resolves a QR label (`/l/<ownerId>/<code>`) to a location (WP6).
struct LocationCodeResolverView: View {
	let ownerId: ID
	let code: String
	var body: some View { PlaceholderScreen(title: code, workPackage: "WP6") }
}
