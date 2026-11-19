import SwiftUI
import WardrobeKit
#if canImport(UIKit)
import UIKit
#endif

@MainActor
private enum BlurhashCache {
	private static let cache = NSCache<NSString, CGImage>()

	static func image(for hash: String) -> CGImage? {
		if let cached = cache.object(forKey: hash as NSString) {
			return cached
		}
		guard let decoded = Blurhash.decodeCGImage(string: hash, width: 32, height: 32) else {
			return nil
		}
		cache.setObject(decoded, forKey: hash as NSString)
		return decoded
	}
}

/// A photo variant via `AppModel.images`, blurhash placeholder first
/// (docs/ios/api-contract.md "Photos").
struct RemotePhotoView: View {
	@Environment(AppModel.self) private var model

	let photo: PhotoDTO?
	var variant: PhotoVariant = .thumb
	var contentMode: ContentMode = .fill

	private struct PhotoRequest: Hashable {
		let id: ID
		let status: PhotoStatus
		let variant: PhotoVariant
	}

	@State private var loadedPhoto: (request: PhotoRequest, data: Data)?
	@State private var isFailed = false

	private var request: PhotoRequest? {
		photo.map { PhotoRequest(id: $0.id, status: $0.status, variant: $0.rendition(variant)) }
	}

	var body: some View {
		let loadedData = loadedPhoto?.request == request ? loadedPhoto?.data : nil
		let showingCutout = request?.variant == .cutoutDisplay || request?.variant == .cutoutThumb
		GeometryReader { geometry in
			ZStack {
				// Base background / placeholder
				Rectangle().fill(.quaternary)

				// Blurhash background if available
				if !(showingCutout && loadedData != nil), let hash = photo?.blurhash, let cgImage = BlurhashCache.image(for: hash) {
					Image(decorative: cgImage, scale: 1.0)
						.resizable()
						.aspectRatio(contentMode: contentMode)
						.frame(width: geometry.size.width, height: geometry.size.height)
						.clipped()
				}

				// Status-dependent overlays
				if let photo {
					switch photo.status {
					case .failed:
						Image(systemName: "photo.badge.exclamationmark")
							.font(.title3)
							.foregroundStyle(.secondary)
					case .pending, .processing:
						ProgressView()
							.tint(.secondary)
					case .ready:
						if let loadedData, let image = platformImage(from: loadedData) {
							// Cutouts are cropped to the garment: show all of it.
							image
								.resizable()
								.aspectRatio(contentMode: showingCutout ? .fit : contentMode)
								.frame(width: geometry.size.width, height: geometry.size.height)
								.clipped()
								.transition(.opacity.animation(.easeInOut(duration: 0.25)))
						} else if isFailed {
							if photo.blurhash == nil {
								Image(systemName: "photo.badge.exclamationmark")
									.font(.title3)
									.foregroundStyle(.secondary)
							}
						} else {
							// Loading indicator if no blurhash
							if photo.blurhash == nil {
								ProgressView()
									.tint(.secondary)
							}
						}
					default:
						if photo.blurhash == nil {
							Image(systemName: "tshirt")
								.font(.title3)
								.foregroundStyle(.secondary)
						}
					}
				} else {
					Image(systemName: "tshirt")
						.font(.title3)
						.foregroundStyle(.secondary)
				}
			}
			.frame(width: geometry.size.width, height: geometry.size.height)
			.clipped()
		}
		.task(id: request) {
			await loadPhoto(request)
		}
	}

	private func loadPhoto(_ request: PhotoRequest?) async {
		guard let request, request.status == .ready else {
			loadedPhoto = nil
			return
		}

		isFailed = false
		do {
			let data = try await model.images.data(photoId: request.id, variant: request.variant)
			guard !Task.isCancelled else { return }
			if let data {
				withAnimation(.easeInOut(duration: 0.25)) {
					loadedPhoto = (request, data)
					isFailed = false
				}
			} else {
				isFailed = true
			}
		} catch {
			guard !Task.isCancelled else { return }
			_ = model.message(for: error)
			isFailed = true
		}
	}

	private func platformImage(from data: Data) -> Image? {
		#if canImport(UIKit)
		if let uiImage = UIImage(data: data) {
			return Image(uiImage: uiImage)
		}
		#endif
		return nil
	}
}

#Preview {
	VStack {
		RemotePhotoView(photo: nil)
			.frame(width: 120, height: 120)
			.clipShape(RoundedRectangle(cornerRadius: 12))
	}
	.environment(AppModel.preview())
}
