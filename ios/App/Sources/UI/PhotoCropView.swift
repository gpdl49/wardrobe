import Mantis
import SwiftUI
import UIKit

struct PhotoCropView: View {
	let data: Data
	let onUse: (Data) -> Void
	@Environment(\.dismiss) private var dismiss
	@State private var failed = false
	@State private var finished = false

	var body: some View {
		VStack(spacing: 0) {
			HStack {
				Text("Crop photo").font(.headline)
				Spacer()
				Button("Use original") { use(data) }
					.buttonStyle(.bordered)
			}.padding()
			.foregroundStyle(.white)
			.tint(.white)
			if let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 {
				PhotoCropEditor(image: image, onUse: { result in
					use(result)
				}, onCancel: { cancel() }, onFailure: { if !finished { failed = true } })
				.clipped()
			} else {
				ContentUnavailableView("Could not load photo", systemImage: "photo.badge.exclamationmark",
					description: Text("Please try another photo."))
				Button("Cancel") { cancel() }.padding()
			}
		}
		.onDisappear { finished = true }
		.background(.black)
		.preferredColorScheme(.dark)
		.alert("Could not crop photo", isPresented: $failed) {
			Button("OK", role: .cancel) {}
		} message: { Text("Please try again or use the original photo.") }
	}

	private func use(_ result: Data) {
		guard !finished else { return }
		finished = true
		onUse(result)
		dismiss()
	}

	private func cancel() {
		finished = true
		dismiss()
	}
}

/// Keeps Mantis's standard gestures and toolbar, and bridges its result to the upload flow.
struct PhotoCropEditor: UIViewControllerRepresentable {
	let image: UIImage
	let onUse: (Data) -> Void
	let onCancel: () -> Void
	let onFailure: () -> Void

	func makeCoordinator() -> Coordinator {
		Coordinator(onUse: onUse, onCancel: onCancel, onFailure: onFailure)
	}

	func makeUIViewController(context: Context) -> Mantis.CropViewController {
		var config = Mantis.Config()
		config.cropMode = .async
		let controller = Mantis.cropViewController(image: image, config: config)
		controller.view.clipsToBounds = true
		controller.delegate = context.coordinator
		return controller
	}

	func updateUIViewController(_ controller: Mantis.CropViewController, context: Context) {
		context.coordinator.onUse = onUse
		context.coordinator.onCancel = onCancel
		context.coordinator.onFailure = onFailure
	}

	@MainActor final class Coordinator: NSObject, CropViewControllerDelegate {
		var onUse: (Data) -> Void
		var onCancel: () -> Void
		var onFailure: () -> Void

		init(onUse: @escaping (Data) -> Void, onCancel: @escaping () -> Void, onFailure: @escaping () -> Void) {
			self.onUse = onUse
			self.onCancel = onCancel
			self.onFailure = onFailure
		}

		func cropViewControllerDidCrop(_ cropViewController: Mantis.CropViewController,
			cropped: UIImage, transformation: Transformation, cropInfo: CropInfo) {
			guard let data = cropped.jpegData(compressionQuality: 0.95) else {
				onFailure()
				return
			}
			onUse(data)
		}

		func cropViewControllerDidCancel(_ cropViewController: Mantis.CropViewController, original: UIImage) {
			onCancel()
		}

		func cropViewControllerDidFailToCrop(_ cropViewController: Mantis.CropViewController, original: UIImage) {
			onFailure()
		}
	}
}
