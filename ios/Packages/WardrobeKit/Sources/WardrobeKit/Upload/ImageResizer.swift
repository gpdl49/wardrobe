import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

public enum ImagePreparationError: Error, LocalizedError, Sendable {
	case cannotReadImage
	case cannotCreateThumbnail
	case cannotCreateDestination
	case cannotFinalizeDestination

	public var errorDescription: String? {
		switch self {
		case .cannotReadImage:
			return "The image could not be read or decoded."
		case .cannotCreateThumbnail:
			return "The thumbnail image could not be created."
		case .cannotCreateDestination:
			return "The image destination could not be created."
		case .cannotFinalizeDestination:
			return "The JPEG image could not be encoded."
		}
	}
}

public enum ImageResizer: Sendable {
	public static func convertToJPEG(
		data: Data,
		maxEdge: Int = 2400,
		quality: Double = 0.85
	) throws -> Data {
		let sourceOptions: [CFString: Any] = [
			kCGImageSourceShouldCache: false
		]
		guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions as CFDictionary) else {
			throw ImagePreparationError.cannotReadImage
		}

		let options: [CFString: Any] = [
			kCGImageSourceCreateThumbnailWithTransform: true,
			kCGImageSourceCreateThumbnailFromImageAlways: true,
			kCGImageSourceThumbnailMaxPixelSize: maxEdge,
			kCGImageSourceShouldCache: false,
		]

		guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
			throw ImagePreparationError.cannotCreateThumbnail
		}

		let destinationData = NSMutableData()
		guard let destination = CGImageDestinationCreateWithData(
			destinationData,
			UTType.jpeg.identifier as CFString,
			1,
			nil
		) else {
			throw ImagePreparationError.cannotCreateDestination
		}

		let destinationOptions: [CFString: Any] = [
			kCGImageDestinationLossyCompressionQuality: quality
		]
		CGImageDestinationAddImage(destination, cgImage, destinationOptions as CFDictionary)

		guard CGImageDestinationFinalize(destination) else {
			throw ImagePreparationError.cannotFinalizeDestination
		}

		return destinationData as Data
	}
}
