import Foundation
import Testing
@testable import WardrobeKit

@Suite struct BlurhashTests {
	@Test func decodesCanonicalTestVector() {
		// Canonical test vector from the blurhash npm package
		let hash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
		let expectedPixels: [UInt8] = [
			135, 164, 177, 255, 161, 173, 177, 255, 181, 180, 171, 255, 160, 172, 174, 255,
			124, 154, 169, 255, 148, 148, 154, 255, 164, 145, 134, 255, 146, 152, 155, 255,
			124, 144, 154, 255, 144, 134, 132, 255, 163, 130, 104, 255, 148, 140, 134, 255,
		]

		let pixels = Blurhash.decode(string: hash, width: 4, height: 3)
		#expect(pixels != nil)
		#expect(pixels?.count == 48)
		#expect(pixels == expectedPixels)
	}

	@Test(arguments: [
		"",
		"abc",
		"12345",
		"LEHV6nWB2yk8pyo0adR*.7kCMdn",   // length 27, expected 28
		"LEHV6nWB2yk8pyo0adR*.7kCMdnjj", // length 29, expected 28
		"LEHV6nWB2yk8pyo0adR*.7kCMdn!",  // invalid character '!'
	])
	func rejectsInvalidBlurhashes(invalid: String) {
		#expect(Blurhash.decode(string: invalid, width: 4, height: 4) == nil)
	}

	@Test func rejectsZeroOrNegativeDimensions() {
		let hash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
		#expect(Blurhash.decode(string: hash, width: 0, height: 10) == nil)
		#expect(Blurhash.decode(string: hash, width: 10, height: 0) == nil)
		#expect(Blurhash.decode(string: hash, width: -4, height: -3) == nil)
	}

	@Test func decodesWithCustomDimensions() {
		let hash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
		let pixels = Blurhash.decode(string: hash, width: 32, height: 32)
		#expect(pixels != nil)
		#expect(pixels?.count == 32 * 32 * 4)

		// Alpha channel should always be 255
		if let pixels {
			for i in stride(from: 3, to: pixels.count, by: 4) {
				#expect(pixels[i] == 255)
			}
		}
	}

	#if canImport(CoreGraphics)
	@Test func decodesToCGImage() {
		let hash = "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
		let cgImage = Blurhash.decodeCGImage(string: hash, width: 16, height: 16)
		#expect(cgImage != nil)
		#expect(cgImage?.width == 16)
		#expect(cgImage?.height == 16)
	}
	#endif
}
