import Foundation
import Observation
import WardrobeKit

/// State and logic for scanning or manually entering a location code.
@MainActor
@Observable
public final class ScanModel {
	public var manualInput: String = ""
	public var errorMessage: String?
	public private(set) var hasScanned: Bool = false

	public init(manualInput: String = "") {
		self.manualInput = manualInput
	}

	/// Validates input and generates the scanned payload string to pass to `onScan`.
	/// If input is already a URL, it is passed trimmed.
	/// If input is a bare code (e.g. "B-07"), it is normalized and formatted as a label URL.
	public func processInput(baseURL: URL, ownerId: ID?) -> String? {
		let trimmed = manualInput.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmed.isEmpty else {
			errorMessage = "Please enter a code or paste a URL"
			return nil
		}

		// If it's already a URL
		if trimmed.hasPrefix("https://") || trimmed.hasPrefix("http://") || trimmed.hasPrefix("xyz.vidur.wardrobe://") {
			guard let url = URL(string: trimmed), url.scheme != nil else {
				errorMessage = "Invalid URL format"
				return nil
			}
			errorMessage = nil
			return trimmed
		}

		// Bare code
		guard let code = normalizeLocationCode(trimmed) else {
			errorMessage = "Invalid location code (e.g. B-07)"
			return nil
		}

		guard let ownerId else {
			errorMessage = "User account not loaded"
			return nil
		}

		errorMessage = nil
		let labelURL = DeepLink.labelURL(ownerId: ownerId, code: code, baseURL: baseURL)
		return labelURL.absoluteString
	}

	/// Marks scan as complete and returns true if this was the first scan call.
	public func recordScan() -> Bool {
		guard !hasScanned else { return false }
		hasScanned = true
		return true
	}
}
