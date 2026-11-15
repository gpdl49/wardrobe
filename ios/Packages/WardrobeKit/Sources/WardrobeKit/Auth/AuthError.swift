import Foundation

/// Errors that can occur during authentication flows (OIDC, PKCE, token exchange, claims validation).
public enum AuthError: Error, Hashable, Sendable, LocalizedError {
	case invalidIDToken(String)
	case invalidClaims(String)
	case invalidEndpoint(String)
	case invalidCallback(String)
	case stateMismatch
	case missingAuthorizationCode
	case authorizationFailed(error: String, description: String?)
	case invalidGrant(description: String)
	case tokenRequestFailed(status: Int, error: String, description: String?)
	case cancelled

	public var errorDescription: String? {
		switch self {
		case .invalidIDToken(let msg): "Invalid ID token: \(msg)"
		case .invalidClaims(let msg): "Invalid claims: \(msg)"
		case .invalidEndpoint(let msg): "Invalid endpoint: \(msg)"
		case .invalidCallback(let msg): "Invalid callback: \(msg)"
		case .stateMismatch: "Authentication state mismatch. Please try again."
		case .missingAuthorizationCode: "Authentication code was missing from the response."
		case .authorizationFailed(let err, let desc): desc ?? err
		case .invalidGrant(let desc): desc
		case .tokenRequestFailed(_, let err, let desc): desc ?? err
		case .cancelled: "Authentication cancelled."
		}
	}

	public var isInvalidGrant: Bool {
		if case .invalidGrant = self { return true }
		if case .tokenRequestFailed(_, let err, _) = self, err == "invalid_grant" { return true }
		return false
	}
}

/// Errors from Keychain operations.
public struct KeychainError: Error, Hashable, Sendable, LocalizedError {
	public var status: OSStatus
	public init(status: OSStatus) { self.status = status }
	public var errorDescription: String? {
		if let msg = SecCopyErrorMessageString(status, nil) as String? {
			return "Keychain error \(status): \(msg)"
		}
		return "Keychain error: \(status)"
	}
}
