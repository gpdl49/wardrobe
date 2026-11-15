import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import WardrobeKit

@Suite("ImageResizerTests")
struct ImageResizerTests {
	@Test func convertsToJPEGAndStripsGPSMetadata() throws {
		let width = 3000
		let height = 2000
		let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
		let context = CGContext(
			data: nil,
			width: width,
			height: height,
			bitsPerComponent: 8,
			bytesPerRow: 0,
			space: colorSpace,
			bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
		)!
		context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
		context.fill(CGRect(x: 0, y: 0, width: width, height: height))
		let cgImage = context.makeImage()!

		let mutableData = NSMutableData()
		let destination = CGImageDestinationCreateWithData(
			mutableData,
			UTType.jpeg.identifier as CFString,
			1,
			nil
		)!
		let gpsDict: [CFString: Any] = [
			kCGImagePropertyGPSLatitude: 37.7749,
			kCGImagePropertyGPSLongitude: -122.4194,
		]
		let props: [CFString: Any] = [
			kCGImagePropertyGPSDictionary: gpsDict
		]
		CGImageDestinationAddImage(destination, cgImage, props as CFDictionary)
		#expect(CGImageDestinationFinalize(destination))

		let sourceWithGPS = mutableData as Data
		let testSource = CGImageSourceCreateWithData(sourceWithGPS as CFData, nil)!
		let testProps = CGImageSourceCopyPropertiesAtIndex(testSource, 0, nil) as? [CFString: Any]
		#expect(testProps?[kCGImagePropertyGPSDictionary] != nil)

		let jpegData = try ImageResizer.convertToJPEG(data: sourceWithGPS, maxEdge: 2400, quality: 0.85)

		// JPEG magic bytes (0xFF, 0xD8)
		#expect(jpegData.count >= 2)
		#expect(jpegData[0] == 0xFF)
		#expect(jpegData[1] == 0xD8)

		// Scaled down to maxEdge
		let resultSource = CGImageSourceCreateWithData(jpegData as CFData, nil)!
		let resultProps = CGImageSourceCopyPropertiesAtIndex(resultSource, 0, nil) as? [CFString: Any]
		let resultWidth = resultProps?[kCGImagePropertyPixelWidth] as? Int
		let resultHeight = resultProps?[kCGImagePropertyPixelHeight] as? Int
		#expect(resultWidth == 2400)
		#expect(resultHeight == 1600)

		// GPS metadata stripped
		#expect(resultProps?[kCGImagePropertyGPSDictionary] == nil)
	}

	@Test func doesNotUpscaleSmallerImages() throws {
		let width = 500
		let height = 300
		let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
		let context = CGContext(
			data: nil,
			width: width,
			height: height,
			bitsPerComponent: 8,
			bytesPerRow: 0,
			space: colorSpace,
			bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
		)!
		context.setFillColor(CGColor(red: 0, green: 1, blue: 0, alpha: 1))
		context.fill(CGRect(x: 0, y: 0, width: width, height: height))
		let cgImage = context.makeImage()!

		let mutableData = NSMutableData()
		let destination = CGImageDestinationCreateWithData(
			mutableData,
			UTType.png.identifier as CFString,
			1,
			nil
		)!
		CGImageDestinationAddImage(destination, cgImage, nil)
		#expect(CGImageDestinationFinalize(destination))

		let jpegData = try ImageResizer.convertToJPEG(data: mutableData as Data, maxEdge: 2400, quality: 0.85)
		let resultSource = CGImageSourceCreateWithData(jpegData as CFData, nil)!
		let resultProps = CGImageSourceCopyPropertiesAtIndex(resultSource, 0, nil) as? [CFString: Any]
		let resultWidth = resultProps?[kCGImagePropertyPixelWidth] as? Int
		let resultHeight = resultProps?[kCGImagePropertyPixelHeight] as? Int
		#expect(resultWidth == 500)
		#expect(resultHeight == 300)
	}

	@Test func throwsOnCorruptData() {
		let corruptData = Data([0x00, 0x01, 0x02, 0x03])
		#expect(throws: ImagePreparationError.self) {
			try ImageResizer.convertToJPEG(data: corruptData)
		}
	}
}
