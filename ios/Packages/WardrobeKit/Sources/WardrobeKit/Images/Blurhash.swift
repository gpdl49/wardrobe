import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif

/// Pure Swift Blurhash decoder (https://blurhash.com).
///
/// Decodes a Blurhash string into an array of RGBA pixels (4 bytes per pixel,
/// row-major, 0...255).
public enum Blurhash: Sendable {
	private static let base83Alphabet: [UInt8] = Array(
		"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~".utf8
	)

	private static let base83Lookup: [Int8] = {
		var table = [Int8](repeating: -1, count: 128)
		for (index, byte) in base83Alphabet.enumerated() {
			if byte < 128 {
				table[Int(byte)] = Int8(index)
			}
		}
		return table
	}()

	/// Decodes a Blurhash string into an RGBA pixel array of the requested dimensions.
	///
	/// - Parameters:
	///   - string: A valid Blurhash string (minimum 6 characters).
	///   - width: Desired width in pixels (must be > 0).
	///   - height: Desired height in pixels (must be > 0).
	///   - punch: Contrast factor (default 1.0).
	/// - Returns: An array of `width * height * 4` UInt8 RGBA values, or nil if invalid.
	public static func decode(
		string: String,
		width: Int,
		height: Int,
		punch: Float = 1.0
	) -> [UInt8]? {
		guard width > 0, height > 0, string.count >= 6 else { return nil }
		let utf8 = Array(string.utf8)

		guard let sizeFlag = decodeBase83(utf8, from: 0, count: 1) else { return nil }
		let numY = (sizeFlag / 9) + 1
		let numX = (sizeFlag % 9) + 1
		let expectedLength = 4 + 2 * numX * numY
		guard utf8.count == expectedLength else { return nil }

		guard let quantisedMaxAC = decodeBase83(utf8, from: 1, count: 1) else { return nil }
		let maxAC = Float(quantisedMaxAC + 1) / 166.0

		var factors = [(r: Float, g: Float, b: Float)](repeating: (0, 0, 0), count: numX * numY)

		// Average color (DC component)
		guard let dcValue = decodeBase83(utf8, from: 2, count: 4) else { return nil }
		factors[0] = decodeDC(dcValue)

		// AC components
		let punchMaxAC = maxAC * punch
		for i in 1..<(numX * numY) {
			guard let acValue = decodeBase83(utf8, from: 4 + 2 * i, count: 2) else { return nil }
			factors[i] = decodeAC(acValue, maximumValue: punchMaxAC)
		}

		var pixels = [UInt8](repeating: 0, count: width * height * 4)

		for y in 0..<height {
			for x in 0..<width {
				var r: Float = 0
				var g: Float = 0
				var b: Float = 0

				for j in 0..<numY {
					let cosY = Float(cos(Double.pi * Double(y) * Double(j) / Double(height)))
					let rowOffset = j * numX
					for i in 0..<numX {
						let cosX = Float(cos(Double.pi * Double(x) * Double(i) / Double(width)))
						let basis = cosX * cosY
						let factor = factors[rowOffset + i]
						r += factor.r * basis
						g += factor.g * basis
						b += factor.b * basis
					}
				}

				let pixelOffset = 4 * (y * width + x)
				pixels[pixelOffset + 0] = UInt8(clamping: linearToSRGB(r))
				pixels[pixelOffset + 1] = UInt8(clamping: linearToSRGB(g))
				pixels[pixelOffset + 2] = UInt8(clamping: linearToSRGB(b))
				pixels[pixelOffset + 3] = 255
			}
		}

		return pixels
	}

	#if canImport(CoreGraphics)
	/// Decodes a Blurhash string into a `CGImage` of the requested dimensions.
	public static func decodeCGImage(
		string: String,
		width: Int,
		height: Int,
		punch: Float = 1.0
	) -> CGImage? {
		guard let pixels = decode(string: string, width: width, height: height, punch: punch) else {
			return nil
		}
		let data = Data(pixels)
		guard let provider = CGDataProvider(data: data as CFData) else { return nil }
		let colorSpace = CGColorSpaceCreateDeviceRGB()
		let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
		return CGImage(
			width: width,
			height: height,
			bitsPerComponent: 8,
			bitsPerPixel: 32,
			bytesPerRow: width * 4,
			space: colorSpace,
			bitmapInfo: bitmapInfo,
			provider: provider,
			decode: nil,
			shouldInterpolate: true,
			intent: .defaultIntent
		)
	}
	#endif

	// MARK: - Private Helpers

	private static func decodeBase83(_ utf8: [UInt8], from start: Int, count: Int) -> Int? {
		guard start + count <= utf8.count else { return nil }
		var value = 0
		for i in start..<(start + count) {
			let byte = utf8[i]
			guard byte < 128 else { return nil }
			let digit = Int(base83Lookup[Int(byte)])
			guard digit >= 0 else { return nil }
			value = value * 83 + digit
		}
		return value
	}

	private static func decodeDC(_ value: Int) -> (r: Float, g: Float, b: Float) {
		let r = (value >> 16) & 255
		let g = (value >> 8) & 255
		let b = value & 255
		return (sRGBToLinear(r), sRGBToLinear(g), sRGBToLinear(b))
	}

	private static func decodeAC(_ value: Int, maximumValue: Float) -> (r: Float, g: Float, b: Float) {
		let quantR = value / (19 * 19)
		let quantG = (value / 19) % 19
		let quantB = value % 19
		return (
			signPow(Float(quantR - 9) / 9.0, 2) * maximumValue,
			signPow(Float(quantG - 9) / 9.0, 2) * maximumValue,
			signPow(Float(quantB - 9) / 9.0, 2) * maximumValue
		)
	}

	private static func sRGBToLinear(_ value: Int) -> Float {
		let v = Float(value) / 255.0
		if v <= 0.04045 {
			return v / 12.92
		} else {
			return pow((v + 0.055) / 1.055, 2.4)
		}
	}

	private static func linearToSRGB(_ value: Float) -> Int {
		let v = max(0, min(1, value))
		if v <= 0.0031308 {
			return Int(trunc((v * 12.92 * 255.0) + 0.5))
		} else {
			return Int(trunc(((1.055 * pow(v, 1.0 / 2.4) - 0.055) * 255.0) + 0.5))
		}
	}

	private static func signPow(_ value: Float, _ exponent: Float) -> Float {
		let sign: Float = value < 0 ? -1 : 1
		return sign * pow(abs(value), exponent)
	}
}
