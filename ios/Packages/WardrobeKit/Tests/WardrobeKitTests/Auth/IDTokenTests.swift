import Foundation
import Testing
@testable import WardrobeKit

@Suite struct IDTokenTests {
	let validIssuer = "https://z.vidur.xyz"
	let validClientID = "wardrobe-ios"

	@Test func decodesValidClaims() throws {
		let futureExp = Date.now.addingTimeInterval(3600).timeIntervalSince1970
		let jwt = makeTestJWT(
			sub: "usr_42",
			email: "alex@example.com",
			preferredUsername: "alex",
			groups: ["wardrobe", "admin"],
			iss: validIssuer,
			aud: [validClientID],
			exp: futureExp,
			nonce: "nonce_123"
		)

		let claims = try IDToken.decodeAndValidate(
			idToken: jwt,
			expectedIssuer: validIssuer,
			expectedClientID: validClientID,
			expectedNonce: "nonce_123"
		)

		#expect(claims.sub == "usr_42")
		#expect(claims.email == "alex@example.com")
		#expect(claims.preferredUsername == "alex")
		#expect(claims.groups == ["wardrobe", "admin"])
		#expect(abs(claims.expiresAt.timeIntervalSince1970 - futureExp) < 1.0)
	}

	@Test func audienceAsSingleStringOrArray() throws {
		// Single string audience
		let jwtSingle = makeTestJWT(aud: [validClientID])
		let claimsSingle = try IDToken.decodeAndValidate(
			idToken: jwtSingle,
			expectedIssuer: validIssuer,
			expectedClientID: validClientID
		)
		#expect(claimsSingle.sub == "usr_test123")

		// Multiple audiences
		let jwtMultiple = makeTestJWT(aud: [validClientID, "extra-audience"])
		let claimsMultiple = try IDToken.decodeAndValidate(
			idToken: jwtMultiple,
			expectedIssuer: validIssuer,
			expectedClientID: validClientID
		)
		#expect(claimsMultiple.sub == "usr_test123")

		// Missing client ID in audience
		let jwtWrongAud = makeTestJWT(aud: ["other-client"])
		#expect(throws: AuthError.self) {
			try IDToken.decodeAndValidate(
				idToken: jwtWrongAud,
				expectedIssuer: validIssuer,
				expectedClientID: validClientID
			)
		}
	}

	@Test func issuerValidation() throws {
		let jwt = makeTestJWT(iss: "https://z.vidur.xyz")

		// Matches with trailing slash normalized
		let claims = try IDToken.decodeAndValidate(
			idToken: jwt,
			expectedIssuer: "https://z.vidur.xyz/",
			expectedClientID: validClientID
		)
		#expect(claims.sub == "usr_test123")

		// Mismatch throws
		#expect(throws: AuthError.self) {
			try IDToken.decodeAndValidate(
				idToken: jwt,
				expectedIssuer: "https://auth.other.com",
				expectedClientID: validClientID
			)
		}
	}

	@Test func nonceValidation() throws {
		let jwt = makeTestJWT(nonce: "correct_nonce")

		// Matching nonce
		let claims = try IDToken.decodeAndValidate(
			idToken: jwt,
			expectedIssuer: validIssuer,
			expectedClientID: validClientID,
			expectedNonce: "correct_nonce"
		)
		#expect(claims.sub == "usr_test123")

		// Nonce mismatch throws
		#expect(throws: AuthError.self) {
			try IDToken.decodeAndValidate(
				idToken: jwt,
				expectedIssuer: validIssuer,
				expectedClientID: validClientID,
				expectedNonce: "wrong_nonce"
			)
		}

		// When expectedNonce is nil (e.g. on token refresh), passes
		let refreshClaims = try IDToken.decodeAndValidate(
			idToken: jwt,
			expectedIssuer: validIssuer,
			expectedClientID: validClientID,
			expectedNonce: nil
		)
		#expect(refreshClaims.sub == "usr_test123")
	}

	@Test func expirationValidation() throws {
		let expiredTime = Date.now.addingTimeInterval(-100).timeIntervalSince1970
		let expiredJWT = makeTestJWT(exp: expiredTime)

		// decodeAndValidate must throw for expired token
		#expect(throws: AuthError.self) {
			try IDToken.decodeAndValidate(
				idToken: expiredJWT,
				expectedIssuer: validIssuer,
				expectedClientID: validClientID
			)
		}

		// decodeClaims (used during restore) decodes without failing expiration
		let staleClaims = try IDToken.decodeClaims(idToken: expiredJWT)
		#expect(staleClaims.expiresAt < Date.now)
		#expect(staleClaims.sub == "usr_test123")
	}

	@Test func malformedJWTFails() {
		#expect(throws: AuthError.self) {
			try IDToken.decodeClaims(idToken: "not.a.jwt.with.four.parts")
		}

		#expect(throws: AuthError.self) {
			try IDToken.decodeClaims(idToken: "onlytwo.parts")
		}

		#expect(throws: AuthError.self) {
			try IDToken.decodeClaims(idToken: "header.invalid_base64!!!.sig")
		}

		let badJSONPayload = "this is not json".data(using: .utf8)!.base64URLEncodedString()
		#expect(throws: AuthError.self) {
			try IDToken.decodeClaims(idToken: "header.\(badJSONPayload).sig")
		}
	}
}
