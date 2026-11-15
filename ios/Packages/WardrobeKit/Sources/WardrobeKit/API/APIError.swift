import Foundation

/// A non-2xx API response, a transport failure (status 0, error "network"),
/// or a response that was not the JSON expected. Mirrors lib/client/api.ts.
public struct APIError: Error, Hashable, Sendable, LocalizedError {
	public var status: Int
	/// Stable machine code from the body (`not_found`, `conflict`, …), or
	/// `http_<status>` / `network` / `decoding` / `signed_out`.
	public var error: String
	public var message: String
	/// Seconds from a `Retry-After` header, when present.
	public var retryAfter: TimeInterval?

	public init(status: Int, error: String, message: String, retryAfter: TimeInterval? = nil) {
		self.status = status; self.error = error; self.message = message; self.retryAfter = retryAfter
	}

	public var errorDescription: String? { message }

	public static func network(_ message: String) -> APIError {
		APIError(status: 0, error: "network", message: message)
	}
	/// No usable session: the user must sign in again.
	public static let signedOut = APIError(status: 401, error: "signed_out", message: "Your session has ended. Sign in again.")

	/// Worth retrying with the same request and Idempotency-Key.
	public var isRetryable: Bool {
		status == 0 || status == 408 || status == 425 || status == 429 || status >= 500
			|| (status == 409 && error == "idempotency_in_progress")
	}
	public var isSignedOut: Bool { status == 401 }
	public var isNotFound: Bool { status == 404 }
	public var isForbidden: Bool { status == 403 }
}

/// The `{error, message}` body of every API error.
public struct APIErrorBody: Codable, Hashable, Sendable {
	public var error: String
	public var message: String
}
