import XCTest
import UIKit
@testable import Wardrobe

final class PhotoCropTests: XCTestCase {
	func testCropProducesSelectedDimensions() throws {
		let format = UIGraphicsImageRendererFormat()
		format.scale = 1
		let image = UIGraphicsImageRenderer(size: CGSize(width: 200, height: 100), format: format).image { context in
			UIColor.red.setFill()
			context.fill(CGRect(x: 0, y: 0, width: 200, height: 100))
		}
		let data = try XCTUnwrap(image.pngData())
		let cropped = try XCTUnwrap(PhotoCrop(left: 0.1, right: 0.2, top: 0.1, bottom: 0.3).render(data))
		let result = try XCTUnwrap(UIImage(data: cropped))
		XCTAssertEqual(result.size.width, 140, accuracy: 1)
		XCTAssertEqual(result.size.height, 60, accuracy: 1)
	}

	func testCropRespectsImageOrientation() throws {
		let format = UIGraphicsImageRendererFormat()
		format.scale = 1
		let source = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 40), format: format).image { context in
			UIColor.blue.setFill()
			context.fill(CGRect(x: 0, y: 0, width: 80, height: 40))
		}
		let oriented = UIImage(cgImage: try XCTUnwrap(source.cgImage), scale: 1, orientation: .right)
		let data = try XCTUnwrap(oriented.jpegData(compressionQuality: 1))
		let displayed = try XCTUnwrap(UIImage(data: data))
		let cropped = try XCTUnwrap(PhotoCrop(left: 0.25).render(data))
		let result = try XCTUnwrap(UIImage(data: cropped))
		XCTAssertEqual(result.size.width, displayed.size.width * 0.75, accuracy: 1)
		XCTAssertEqual(result.size.height, displayed.size.height, accuracy: 1)
	}

	func testInvalidImageAndEmptyCropAreRejected() {
		XCTAssertNil(PhotoCrop().render(Data()))
		let image = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { _ in }
		XCTAssertNil(PhotoCrop(left: 0.5, right: 0.5).render(image.pngData()!))
	}
}
