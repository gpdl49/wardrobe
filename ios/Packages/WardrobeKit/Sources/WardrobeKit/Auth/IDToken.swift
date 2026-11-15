import Foundation

// MARK: - Audience

/// Represents the `aud` claim in a JWT, which may be a single string or an array of strings.
struct Audience: Codable, Sendable {
	var values: [String]

	init(values: [String]) {
		self.values = values
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.singleValueContainer()
		if let single = try? container.decode(String.self) {
			self.values = [single]
		} else if let array = try? container.decode([String].self) {
			self.values = array
		} else {
			self.values = []
		}
	}

	func encode(to encoder: Encoder) throws {
		if values.count == 1 {
			var container = encoder.singleValueContainer()
			try container.encode(values[0])
		} else {
			var container = encoder.singleValueContainer()
			try container.encode(values)
		}
	}

	func contains(_ clientID: String) -> Bool {
		values.contains(clientID)
	}
}

// MARK: - IDTokenPayload

struct IDTokenPayload: Codable, Sendable {
	var sub: String
	var email: String?
	var preferredUsername: String?
	var groups: [String]?
	var iss: String
	var aud: Audience
	var exp: Double
	var nonce: String?

	enum CodingKeys: String, CodingKey {
		case sub
		case email
		case preferredUsername = "preferred_username"
		case groups
		case iss
		case aud
		case exp
		case nonce
	}
}

// MARK: - IDToken Decoder & Validator

public enum IDToken {
	/// Decodes claims without validating expiration or nonce (used when restoring saved tokens from Keychain).
	public static func decodeClaims(idToken: String) throws -> AuthClaims {
		let payload = try decodePayload(from: idToken)
		return AuthClaims(
			sub: payload.sub,
			email: payload.email,
			preferredUsername: payload.preferredUsername,
			groups: payload.groups ?? [],
			expiresAt: Date(timeIntervalSince1970: payload.exp)
		)
	}

	/// Decodes and validates the ID token per the OIDC spec and the app contract:
	/// - Validates `iss` matches expected issuer.
	/// - Validates `aud` contains expected client ID.
	/// - Validates `nonce` on sign-in (if expectedNonce is provided).
	/// - Validates `exp` is in the future.
	public static func decodeAndValidate(
		idToken: String,
		expectedIssuer: String,
		expectedClientID: String,
		expectedNonce: String? = nil,
		now: Date = Date()
	) throws -> AuthClaims {
		let payload = try decodePayload(from: idToken)

		let expectedIss = normalizeIssuer(expectedIssuer)
		let tokenIss = normalizeIssuer(payload.iss)
		guard tokenIss == expectedIss else {
			throw AuthError.invalidClaims("Issuer mismatch: expected \(expectedIssuer), got \(payload.iss)")
		}

		guard payload.aud.contains(expectedClientID) else {
			throw AuthError.invalidClaims("Audience mismatch: expected \(expectedClientID) in \(payload.aud.values)")
		}

		if let expectedNonce {
			guard payload.nonce == expectedNonce else {
				throw AuthError.invalidClaims("Nonce mismatch: expected \(expectedNonce), got \(payload.nonce ?? "nil")")
			}
		}

		let expiresAt = Date(timeIntervalSince1970: payload.exp)
		guard expiresAt > now else {
			throw AuthError.invalidClaims("ID token expired at \(expiresAt)")
		}

		return AuthClaims(
			sub: payload.sub,
			email: payload.email,
			preferredUsername: payload.preferredUsername,
			groups: payload.groups ?? [],
			expiresAt: expiresAt
		)
	}

	private static func decodePayload(from idToken: String) throws -> IDTokenPayload {
		let parts = idToken.split(separator: ".")
		guard parts.count == 3 else {
			throw AuthError.invalidIDToken("JWT must contain exactly three parts")
		}
		guard let payloadData = Data(base64URLEncoded: String(parts[1])) else {
			throw AuthError.invalidIDToken("Base64URL decoding of payload failed")
		}
		do {
			return try JSONDecoder().decode(IDTokenPayload.self, from: payloadData)
		} catch {
			throw AuthError.invalidIDToken("Decoding payload JSON failed: \(error.localizedDescription)")
		}
	}

	private static func normalizeIssuer(_ issuer: String) -> String {
		issuer.hasSuffix("/") ? String(issuer.dropLast()) : issuer
	}
}
