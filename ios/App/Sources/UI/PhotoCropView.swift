import SwiftUI
import UIKit

/// Normalized crop edges in the image as displayed, after orientation is applied.
struct PhotoCrop {
	var left: Double = 0
	var right: Double = 0
	var top: Double = 0
	var bottom: Double = 0

	func render(_ data: Data) -> Data? {
		guard let image = UIImage(data: data), image.size.width > 0, image.size.height > 0,
			left >= 0, right >= 0, top >= 0, bottom >= 0,
			left + right < 1, top + bottom < 1 else { return nil }
		let size = image.size
		let rect = CGRect(x: size.width * left, y: size.height * top,
			width: size.width * (1 - left - right), height: size.height * (1 - top - bottom))
		let format = UIGraphicsImageRendererFormat()
		format.scale = image.scale
		let result = UIGraphicsImageRenderer(size: rect.size, format: format).image { _ in
			image.draw(at: CGPoint(x: -rect.minX, y: -rect.minY))
		}
		return result.jpegData(compressionQuality: 0.95)
	}
}

struct PhotoCropView: View {
	let data: Data
	let onUse: (Data) -> Void
	@Environment(\.dismiss) private var dismiss
	@State private var crop = PhotoCrop()
	@State private var failed = false

	var body: some View {
		NavigationStack {
			VStack {
				if let image = UIImage(data: data) {
					GeometryReader { geometry in
						let scale = min(geometry.size.width / image.size.width, geometry.size.height / image.size.height)
						let width = image.size.width * scale
						let height = image.size.height * scale
						ZStack(alignment: .topLeading) {
							Image(uiImage: image).resizable().frame(width: width, height: height)
							Rectangle().stroke(.white, lineWidth: 3)
								.frame(width: width * (1 - crop.left - crop.right), height: height * (1 - crop.top - crop.bottom))
								.offset(x: width * crop.left, y: height * crop.top)
						}
						.frame(width: width, height: height)
						.position(x: geometry.size.width / 2, y: geometry.size.height / 2)
					}
				}
				Button("Use original") { onUse(data); dismiss() }
					.buttonStyle(.bordered)
				Text("Adjust the edges to frame your photo.").font(.caption).foregroundStyle(.secondary)
				edge("Left", value: $crop.left)
				edge("Right", value: $crop.right)
				edge("Top", value: $crop.top)
				edge("Bottom", value: $crop.bottom)
			}.padding()
			.navigationTitle("Crop photo")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
				ToolbarItem(placement: .confirmationAction) {
					Button("Use crop") {
						if let result = crop.render(data) { onUse(result); dismiss() } else { failed = true }
					}
				}
			}
			.alert("Could not crop photo", isPresented: $failed) {
				Button("OK", role: .cancel) {}
			} message: { Text("Please try another photo.") }
		}
	}

	private func edge(_ title: String, value: Binding<Double>) -> some View {
		HStack {
			Text(title).frame(width: 55, alignment: .leading)
			Slider(value: value, in: 0...0.45).accessibilityLabel("\(title) crop")
		}
	}
}
