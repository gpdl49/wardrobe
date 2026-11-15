import Foundation
import Testing
import UIKit
import WardrobeKit
@testable import Wardrobe

@MainActor
@Suite struct ScanTests {
	let base = URL(string: "https://wardrobe.vidur.xyz")!
	let ownerId = "00000000-0000-4000-8000-000000000001"

	@Test func qrPayloadEqualsLabelURL() {
		let labelURL = DeepLink.labelURL(ownerId: ownerId, code: "B-07", baseURL: base)
		#expect(labelURL.absoluteString == "https://wardrobe.vidur.xyz/l/00000000-0000-4000-8000-000000000001/B-07")

		let qrImage = QRCodeGenerator.generateQRCode(from: labelURL)
		#expect(qrImage != nil)
		#expect(qrImage?.size.width ?? 0 > 0)
	}

	@Test func scannedTextParsesToRoute() {
		let labelURL = DeepLink.labelURL(ownerId: ownerId, code: "B-07", baseURL: base)
		let route = DeepLink.route(fromScanned: labelURL.absoluteString, baseURL: base)

		#expect(route == .label(ownerId: ownerId, code: "B-07"))
	}

	@Test func scanModelProcessesBareCode() {
		let model = ScanModel(manualInput: "b-07")
		let output = model.processInput(baseURL: base, ownerId: ownerId)

		#expect(output != nil)
		#expect(output == "https://wardrobe.vidur.xyz/l/\(ownerId)/B-07")
		#expect(model.errorMessage == nil)
	}

	@Test func scanModelProcessesFullURL() {
		let full = "https://wardrobe.vidur.xyz/l/\(ownerId)/CL-BEDROOM"
		let model = ScanModel(manualInput: full)
		let output = model.processInput(baseURL: base, ownerId: ownerId)

		#expect(output == full)
		#expect(model.errorMessage == nil)
	}

	@Test func scanModelRejectsInvalid() {
		let model = ScanModel(manualInput: "invalid code with spaces")
		let output = model.processInput(baseURL: base, ownerId: ownerId)

		#expect(output == nil)
		#expect(model.errorMessage != nil)
	}

	@Test func scanModelRecordScanOnlyFiresOnce() {
		let model = ScanModel()
		#expect(model.hasScanned == false)

		let first = model.recordScan()
		#expect(first == true)
		#expect(model.hasScanned == true)

		let second = model.recordScan()
		#expect(second == false)
		#expect(model.hasScanned == true)
	}
}
