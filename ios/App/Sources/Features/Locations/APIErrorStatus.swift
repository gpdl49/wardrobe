import WardrobeKit

/// Reads `APIError.status` even when the test bundle links a distinct copy of WardrobeKit
/// (thrown errors from `FixtureWardrobeAPI` are not always `as? APIError` in the app module).
enum APIErrorStatus {
	static func status(of error: Error) -> Int? {
		if let api = error as? APIError { return api.status }
		guard String(describing: type(of: error)).contains("APIError") else { return nil }
		for child in Mirror(reflecting: error).children where child.label == "status" {
			return child.value as? Int
		}
		return nil
	}
}
