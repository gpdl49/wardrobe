import SwiftUI
import UIKit

/// UIViewControllerRepresentable for capturing photos with UIImagePickerController.
struct CameraPickerView: UIViewControllerRepresentable {
	@Environment(\.dismiss) private var dismiss
	var onImageCaptured: (Data) -> Void

	func makeCoordinator() -> Coordinator {
		Coordinator(parent: self)
	}

	func makeUIViewController(context: Context) -> UIImagePickerController {
		let picker = UIImagePickerController()
		picker.delegate = context.coordinator
		if UIImagePickerController.isSourceTypeAvailable(.camera) {
			picker.sourceType = .camera
		} else {
			// Fallback to photo library on simulator
			picker.sourceType = .photoLibrary
		}
		return picker
	}

	func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

	final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
		let parent: CameraPickerView

		init(parent: CameraPickerView) {
			self.parent = parent
		}

		func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
			if let image = info[.originalImage] as? UIImage,
				let data = image.jpegData(compressionQuality: 0.85) {
				parent.onImageCaptured(data)
			}
			parent.dismiss()
		}

		func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
			parent.dismiss()
		}
	}
}
