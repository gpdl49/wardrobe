import Mantis
import SwiftUI
import XCTest
import UIKit
@testable import Wardrobe

@MainActor
final class PhotoCropTests: XCTestCase {
	private func image(width: CGFloat = 140, height: CGFloat = 60) -> UIImage {
		let format = UIGraphicsImageRendererFormat()
		format.scale = 1
		return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
			UIColor.red.setFill()
			context.fill(CGRect(x: 0, y: 0, width: width, height: height))
		}
	}

	private func deliver(_ image: UIImage, to coordinator: PhotoCropEditor.Coordinator) {
		let rect = CGRect(origin: .zero, size: image.size)
		let transformation = Transformation(offset: .zero, rotation: 0, scale: 1,
			isManuallyZoomed: false, initialMaskFrame: rect, maskFrame: rect,
			cropWorkbenchViewBounds: rect, horizontallyFlipped: false, verticallyFlipped: false)
		let info = CropInfo(translation: .zero, rotation: 0, scaleX: 1, scaleY: 1,
			cropSize: image.size, imageViewSize: image.size,
			cropRegion: CropRegion(topLeft: .zero, topRight: CGPoint(x: 1, y: 0),
				bottomLeft: CGPoint(x: 0, y: 1), bottomRight: CGPoint(x: 1, y: 1)))
		coordinator.cropViewControllerDidCrop(Mantis.cropViewController(image: image),
			cropped: image, transformation: transformation, cropInfo: info)
	}

	func testCroppedImageIsDeliveredAsJPEGWithSelectedDimensions() throws {
		var output: Data?
		let coordinator = PhotoCropEditor.Coordinator(onUse: { output = $0 },
			onCancel: { XCTFail("Unexpected cancellation") }, onFailure: { XCTFail("Unexpected failure") })
		deliver(image(), to: coordinator)
		let data = try XCTUnwrap(output)
		XCTAssertEqual(Array(data.prefix(2)), [0xff, 0xd8])
		let result = try XCTUnwrap(UIImage(data: data))
		XCTAssertEqual(result.size.width, 140)
		XCTAssertEqual(result.size.height, 60)
	}

	func testCroppedImageRespectsOrientation() throws {
		var output: Data?
		let coordinator = PhotoCropEditor.Coordinator(onUse: { output = $0 },
			onCancel: { XCTFail("Unexpected cancellation") }, onFailure: { XCTFail("Unexpected failure") })
		let source = image(width: 80, height: 40)
		let oriented = UIImage(cgImage: try XCTUnwrap(source.cgImage), scale: 1, orientation: .right)
		deliver(oriented, to: coordinator)
		let result = try XCTUnwrap(UIImage(data: try XCTUnwrap(output)))
		XCTAssertEqual(result.size.width, 40)
		XCTAssertEqual(result.size.height, 80)
		XCTAssertEqual(result.imageOrientation, oriented.imageOrientation)
	}

	func testPresentedEditorCanCropAndReturnPhoto() throws {
		let source = image(width: 800, height: 600)
		let completed = expectation(description: "Mantis returns the cropped image")
		var output: Data?
		let host = UIHostingController(rootView: PhotoCropView(data: try XCTUnwrap(source.pngData())) {
			output = $0
			completed.fulfill()
		})
		let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
		let window = UIWindow(windowScene: scene)
		window.rootViewController = host
		window.makeKeyAndVisible()
		defer { window.isHidden = true; window.rootViewController = nil }
		host.view.layoutIfNeeded()
		let ready = expectation(description: "Editor appears")
		DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { ready.fulfill() }
		wait(for: [ready], timeout: 5)

		func cropController(in parent: UIViewController) -> Mantis.CropViewController? {
			if let controller = parent as? Mantis.CropViewController { return controller }
			return parent.children.lazy.compactMap { cropController(in: $0) }.first
		}
		let controller = try XCTUnwrap(cropController(in: host))
		XCTAssertGreaterThan(controller.view.bounds.width, 0)
		XCTAssertGreaterThan(controller.view.bounds.height, 0)
		let screenshot = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
			window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
		}
		let attachment = XCTAttachment(image: screenshot)
		attachment.name = "Mantis crop editor"
		attachment.lifetime = .keepAlways
		add(attachment)
		controller.crop()
		wait(for: [completed], timeout: 10)
		let result = try XCTUnwrap(UIImage(data: try XCTUnwrap(output)))
		XCTAssertEqual(result.size.width, 800, accuracy: 1)
		XCTAssertEqual(result.size.height, 600, accuracy: 1)
	}

	func testCancelDoesNotReplacePhoto() {
		var cancelled = false
		let coordinator = PhotoCropEditor.Coordinator(onUse: { _ in XCTFail("Cancelled crop saved a photo") },
			onCancel: { cancelled = true }, onFailure: { XCTFail("Unexpected failure") })
		let original = image()
		coordinator.cropViewControllerDidCancel(Mantis.cropViewController(image: original), original: original)
		XCTAssertTrue(cancelled)
	}

	func testCropFailureAllowsRetryWithoutSavingOrDismissing() {
		var failed = false
		var output: Data?
		let coordinator = PhotoCropEditor.Coordinator(onUse: { output = $0 },
			onCancel: { XCTFail("Failed crop dismissed the editor") }, onFailure: { failed = true })
		let original = image()
		coordinator.cropViewControllerDidFailToCrop(Mantis.cropViewController(image: original), original: original)
		XCTAssertTrue(failed)
		XCTAssertNil(output)
		deliver(original, to: coordinator)
		XCTAssertNotNil(output)
	}
}
