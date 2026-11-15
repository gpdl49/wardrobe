import SwiftUI
import WardrobeKit

/// Sheet: create an item (optionally in a location / another owner's
/// wardrobe) with photos (WP5). Calls `onCreated` with the new item's id.
struct NewItemView: View {
	var locationId: ID? = nil
	var ownerId: ID? = nil
	var onCreated: (ID) -> Void = { _ in }
	var body: some View { PlaceholderScreen(title: "New item", workPackage: "WP5") }
}
