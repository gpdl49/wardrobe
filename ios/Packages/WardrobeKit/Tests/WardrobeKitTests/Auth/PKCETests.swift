import Foundation
import Testing
@testable import WardrobeKit

@Suite struct PKCETests {
	// MARK: - RFC 7636 Appendix B Test Vector

	@Test func rfc7636AppendixBChallengeVector() {
		let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
		let expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

		let challenge = PKCE.codeChallenge(for: verifier)
		#expect(challenge == expectedChallenge)
	}

	// MARK: - Verifier Generation

	@Test func verifierLengthAndCharacterSet() {
		let verifier = PKCE.generateCodeVerifier(length: 64)
		#expect(verifier.count == 64)

		let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
		#expect(verifier.unicodeScalars.allSatisfy { allowed.contains($0) })

		// Clamping checks
		let shortVerifier = PKCE.generateCodeVerifier(length: 10)
		#expect(shortVerifier.count == 43)

		let longVerifier = PKCE.generateCodeVerifier(length: 200)
		#expect(longVerifier.count == 128)
	}

	// MARK: - Base64URL

	@Test func base64URLEncodingAndDecoding() {
		let testData = Data([0x00, 0x01, 0x02, 0xFB, 0xFF, 0xFE])
		let encoded = testData.base64URLEncodedString()
		#expect(!encoded.contains("+"))
		#expect(!encoded.contains("/"))
		#expect(!encoded.contains("="))

		let decoded = Data(base64URLEncoded: encoded)
		#expect(decoded == testData)
	}

	// MARK: - Authorization URL

	@Test func authorizationURLQueryItems() {
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: "wardrobe-ios-test",
			redirectURI: URL(string: "xyz.vidur.wardrobe://oauth/callback")!,
			scopes: ["openid", "email", "profile", "offline_access"]
		)

		let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
		let challenge = PKCE.codeChallenge(for: verifier)
		let state = "test_state_123"
		let nonce = "test_nonce_456"

		let authEndpoint = URL(string: "https://z.vidur.xyz/oauth/v2/authorize")!
		var components = URLComponents(url: authEndpoint, resolvingAgainstBaseURL: true)!
		components.queryItems = [
			URLQueryItem(name: "client_id", value: config.clientID),
			URLQueryItem(name: "redirect_uri", value: config.redirectURI.absoluteString),
			URLQueryItem(name: "response_type", value: "code"),
			URLQueryItem(name: "scope", value: config.scopes.joined(separator: " ")),
			URLQueryItem(name: "code_challenge", value: challenge),
			URLQueryItem(name: "code_challenge_method", value: "S256"),
			URLQueryItem(name: "state", value: state),
			URLQueryItem(name: "nonce", value: nonce),
		]

		let url = components.url!
		let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: true)?.queryItems ?? []
		let queryMap = Dictionary(uniqueKeysWithValues: queryItems.map { ($0.name, $0.value ?? "") })

		#expect(queryMap["client_id"] == "wardrobe-ios-test")
		#expect(queryMap["redirect_uri"] == "xyz.vidur.wardrobe://oauth/callback")
		#expect(queryMap["response_type"] == "code")
		#expect(queryMap["scope"] == "openid email profile offline_access")
		#expect(queryMap["code_challenge"] == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
		#expect(queryMap["code_challenge_method"] == "S256")
		#expect(queryMap["state"] == "test_state_123")
		#expect(queryMap["nonce"] == "test_nonce_456")

		// prompt must be omitted
		#expect(queryMap["prompt"] == nil)
	}

	// MARK: - Callback Parsing

	@Test func callbackParsingStateMismatch() {
		let expectedState = "expected_state"
		let callback = URL(string: "xyz.vidur.wardrobe://oauth/callback?code=abc&state=wrong_state")!
		let components = URLComponents(url: callback, resolvingAgainstBaseURL: true)!
		let returnedState = components.queryItems?.first(where: { $0.name == "state" })?.value

		#expect(returnedState != expectedState)
	}

	@Test func callbackParsingErrorParam() {
		let callback = URL(string: "xyz.vidur.wardrobe://oauth/callback?error=access_denied&error_description=User%20cancelled")!
		let components = URLComponents(url: callback, resolvingAgainstBaseURL: true)!
		let errorParam = components.queryItems?.first(where: { $0.name == "error" })?.value
		let errorDesc = components.queryItems?.first(where: { $0.name == "error_description" })?.value

		#expect(errorParam == "access_denied")
		#expect(errorDesc == "User cancelled")
	}

	@Test func callbackParsingMissingCode() {
		let callback = URL(string: "xyz.vidur.wardrobe://oauth/callback?state=my_state")!
		let components = URLComponents(url: callback, resolvingAgainstBaseURL: true)!
		let code = components.queryItems?.first(where: { $0.name == "code" })?.value

		#expect(code == nil)
	}
}
