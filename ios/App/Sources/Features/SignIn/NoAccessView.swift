import SwiftUI

/// Signed in, but without the `wardrobe` role (WP8).
struct NoAccessView: View {
	var body: some View { PlaceholderScreen(title: "No access", workPackage: "WP8") }
}
