import SwiftUI
import WardrobeKit

/// A photo variant via `AppModel.images`, blurhash placeholder first
/// (docs/ios/api-contract.md "Photos"). Shell from WP0; WP4 implements.
struct RemotePhotoView: View {
	let photo: PhotoDTO?
	var variant: PhotoVariant = .thumb
	var contentMode: ContentMode = .fill

	var body: some View {
		Rectangle().fill(.quaternary).overlay { Image(systemName: "tshirt").foregroundStyle(.secondary) }
	}
}
