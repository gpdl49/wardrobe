import CryptoKit
import Foundation
import Security

// MARK: - Base64URL Encoding / Decoding

extension Data {
	/// Encodes Data to a Base64URL string without padding characters ('=').
	public func base64URLEncodedString() -> String {
		base64EncodedString()
			.replacingOccurrences(of: "+", with: "-")
			.replacingOccurrences(of: "/", with: "_")
			.replacingOccurrences(of: "=", with: "")
	}

	/// Decodes a Base64URL string (with or without padding characters) to Data.
	public init?(base64URLEncoded string: String) {
		var base64 = string
			.replacingOccurrences(of: "-", with: "+")
			.replacingOccurrences(of: "_", with: "/")
		let remainder = base64.count % 4
		if remainder > 0 {
			base64.append(String(repeating: "=", count: 4 - remainder))
		}
		self.init(base64Encoded: base64)
	}
}

// MARK: - PKCE

/// Implements RFC 7636 Proof Key for Code Exchange (PKCE).
public enum PKCE {
	/// The unreserved characters allowed in a code_verifier (RFC 7636 Section 4.1).
	private static let unreservedCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"

	/// Generates a cryptographically random code_verifier between 43 and 128 characters.
	public static func generateCodeVerifier(length: Int = 64) -> String {
		let clampedLength = max(43, min(128, length))
		var bytes = [UInt8](repeating: 0, count: clampedLength)
		let result = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
		guard result == errSecSuccess else {
			return String((0..<clampedLength).compactMap { _ in unreservedCharacters.randomElement() })
		}
		let chars = Array(unreservedCharacters)
		return String(bytes.map { chars[Int($0) % chars.count] })
	}

	/// Computes the S256 code_challenge for a code_verifier per RFC 7636 Section 4.2.
	/// BASE64URL-ENCODE(SHA256(ASCII(code_verifier))) with no padding.
	public static func codeChallenge(for verifier: String) -> String {
		let asciiData = Data(verifier.utf8)
		let digest = SHA256.hash(data: asciiData)
		return Data(digest).base64URLEncodedString()
	}

	/// Generates a cryptographically secure random Base64URL string (e.g. for state or nonce).
	public static func generateRandomString(byteCount: Int = 32) -> String {
		var bytes = [UInt8](repeating: 0, count: byteCount)
		let result = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
		guard result == errSecSuccess else {
			return UUID().uuidString
		}
		return Data(bytes).base64URLEncodedString()
	}
}
