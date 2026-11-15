import Foundation
import Testing
@testable import WardrobeKit

@Suite struct TokenStoreTests {
	@Test func validTokenReturnsCachedWhenNotExpiringSoon() async throws {
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://token-cached.vidur.xyz")!,
			clientID: "wardrobe-ios"
		)
		let discovery = OIDCDiscoveryDocument(
			issuer: "https://token-cached.vidur.xyz",
			authorizationEndpoint: URL(string: "https://token-cached.vidur.xyz/oauth/v2/authorize")!,
			tokenEndpoint: URL(string: "https://token-cached.vidur.xyz/oauth/v2/token")!,
			endSessionEndpoint: URL(string: "https://token-cached.vidur.xyz/oidc/v1/end_session")!
		)

		let keychain = InMemoryKeychainStorage()
		let initialJWT = makeTestJWT(
			iss: "https://token-cached.vidur.xyz",
			exp: Date.now.addingTimeInterval(3600).timeIntervalSince1970
		)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: initialJWT,
			refreshToken: "rt_initial",
			expiresAt: Date.now.addingTimeInterval(3600)
		))

		let session = AuthURLProtocolStub.makeStubbedSession()
		let oidcDiscovery = OIDCDiscovery(issuer: config.issuer, session: session, initialDocument: discovery)
		let client = OIDCClient(session: session)

		let store = TokenStore(
			config: config,
			discovery: oidcDiscovery,
			client: client,
			keychain: keychain
		)

		_ = try await store.restoreFromKeychain()

		let token = try await store.validToken()
		#expect(token == initialJWT)
	}

	@Test func proactiveRefreshWhenExpiringInUnder5Minutes() async throws {
		let host = "token-proactive.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)
		let discovery = OIDCDiscoveryDocument(
			issuer: issuer,
			authorizationEndpoint: URL(string: "\(issuer)/oauth/v2/authorize")!,
			tokenEndpoint: URL(string: "\(issuer)/oauth/v2/token")!,
			endSessionEndpoint: URL(string: "\(issuer)/oidc/v1/end_session")!
		)

		let newJWT = makeTestJWT(
			sub: "usr_refreshed",
			iss: issuer,
			exp: Date.now.addingTimeInterval(3600).timeIntervalSince1970
		)

		AuthURLProtocolStub.setHandler(forHost: host) { request in
			let bodyData = readRequestBody(from: request)
			let bodyString = String(decoding: bodyData, as: UTF8.self)
			#expect(bodyString.contains("grant_type=refresh_token"))
			#expect(bodyString.contains("client_id=wardrobe-ios"))

			let responseJSON = """
			{
				"id_token": "\(newJWT)",
				"refresh_token": "rt_rotated_123",
				"token_type": "Bearer",
				"expires_in": 3600
			}
			"""
			let response = HTTPURLResponse(
				url: request.url!,
				statusCode: 200,
				httpVersion: nil,
				headerFields: ["Content-Type": "application/json"]
			)!
			return (response, Data(responseJSON.utf8))
		}

		let keychain = InMemoryKeychainStorage()
		let soonExpiringJWT = makeTestJWT(
			iss: issuer,
			exp: Date.now.addingTimeInterval(120).timeIntervalSince1970
		)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: soonExpiringJWT,
			refreshToken: "rt_old",
			expiresAt: Date.now.addingTimeInterval(120)
		))

		let session = AuthURLProtocolStub.makeStubbedSession()
		let oidcDiscovery = OIDCDiscovery(issuer: config.issuer, session: session, initialDocument: discovery)
		let client = OIDCClient(session: session)

		let store = TokenStore(
			config: config,
			discovery: oidcDiscovery,
			client: client,
			keychain: keychain
		)

		_ = try await store.restoreFromKeychain()

		let token = try await store.validToken()
		#expect(token == newJWT)

		let stored = try keychain.readTokens()
		#expect(stored?.refreshToken == "rt_rotated_123")
		#expect(stored?.idToken == newJWT)
	}

	@Test func singleFlightRefreshDeduplicatesConcurrentRequests() async throws {
		let host = "token-singleflight.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)
		let discovery = OIDCDiscoveryDocument(
			issuer: issuer,
			authorizationEndpoint: URL(string: "\(issuer)/oauth/v2/authorize")!,
			tokenEndpoint: URL(string: "\(issuer)/oauth/v2/token")!,
			endSessionEndpoint: URL(string: "\(issuer)/oidc/v1/end_session")!
		)

		let newJWT = makeTestJWT(
			iss: issuer,
			exp: Date.now.addingTimeInterval(3600).timeIntervalSince1970
		)

		AuthURLProtocolStub.setDelay(0.05, forHost: host)
		AuthURLProtocolStub.setHandler(forHost: host) { request in
			let responseJSON = """
			{
				"id_token": "\(newJWT)",
				"refresh_token": "rt_new",
				"token_type": "Bearer",
				"expires_in": 3600
			}
			"""
			let response = HTTPURLResponse(
				url: request.url!,
				statusCode: 200,
				httpVersion: nil,
				headerFields: ["Content-Type": "application/json"]
			)!
			return (response, Data(responseJSON.utf8))
		}

		let keychain = InMemoryKeychainStorage()
		let expiredJWT = makeTestJWT(
			iss: issuer,
			exp: Date.now.addingTimeInterval(-10).timeIntervalSince1970
		)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: expiredJWT,
			refreshToken: "rt_initial",
			expiresAt: Date.now.addingTimeInterval(-10)
		))

		let session = AuthURLProtocolStub.makeStubbedSession()
		let oidcDiscovery = OIDCDiscovery(issuer: config.issuer, session: session, initialDocument: discovery)
		let client = OIDCClient(session: session)

		let store = TokenStore(
			config: config,
			discovery: oidcDiscovery,
			client: client,
			keychain: keychain
		)

		_ = try await store.restoreFromKeychain()

		async let call1 = store.validToken()
		async let call2 = store.validToken()
		async let call3 = store.validToken()
		async let call4 = store.validToken()
		async let call5 = store.validToken()

		let results = try await [call1, call2, call3, call4, call5]
		for r in results {
			#expect(r == newJWT)
		}

		let count = AuthURLProtocolStub.requestCount(forHost: host)
		#expect(count == 1)
	}

	@Test func refreshAfterRejectionHandlesRaceAndFreshRejection() async throws {
		let host = "token-rejection.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)
		let discovery = OIDCDiscoveryDocument(
			issuer: issuer,
			authorizationEndpoint: URL(string: "\(issuer)/oauth/v2/authorize")!,
			tokenEndpoint: URL(string: "\(issuer)/oauth/v2/token")!,
			endSessionEndpoint: URL(string: "\(issuer)/oidc/v1/end_session")!
		)

		let freshJWT = makeTestJWT(
			iss: issuer,
			exp: Date.now.addingTimeInterval(3600).timeIntervalSince1970
		)
		AuthURLProtocolStub.setHandler(forHost: host) { request in
			let responseJSON = """
			{
				"id_token": "\(freshJWT)",
				"refresh_token": "rt_fresh",
				"token_type": "Bearer",
				"expires_in": 3600
			}
			"""
			let response = HTTPURLResponse(
				url: request.url!,
				statusCode: 200,
				httpVersion: nil,
				headerFields: ["Content-Type": "application/json"]
			)!
			return (response, Data(responseJSON.utf8))
		}

		let keychain = InMemoryKeychainStorage()
		let currentJWT = makeTestJWT(
			iss: issuer,
			exp: Date.now.addingTimeInterval(1800).timeIntervalSince1970
		)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: currentJWT,
			refreshToken: "rt_current",
			expiresAt: Date.now.addingTimeInterval(1800)
		))

		let session = AuthURLProtocolStub.makeStubbedSession()
		let oidcDiscovery = OIDCDiscovery(issuer: config.issuer, session: session, initialDocument: discovery)
		let client = OIDCClient(session: session)

		let store = TokenStore(
			config: config,
			discovery: oidcDiscovery,
			client: client,
			keychain: keychain
		)

		_ = try await store.restoreFromKeychain()

		// Case 1: rejected token is an older token ("stale_token" != currentJWT)
		// Should return currentJWT without network call
		let token1 = try await store.refreshAfterRejection(of: "stale_token")
		#expect(token1 == currentJWT)
		#expect(AuthURLProtocolStub.requestCount(forHost: host) == 0)

		// Case 2: rejected token matches currentJWT
		// Should trigger refresh and return freshJWT
		let token2 = try await store.refreshAfterRejection(of: currentJWT)
		#expect(token2 == freshJWT)
		#expect(AuthURLProtocolStub.requestCount(forHost: host) == 1)
	}

	@Test func invalidGrantClearsKeychainAndNotifiesSessionEnded() async throws {
		let host = "token-invalidgrant.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)
		let discovery = OIDCDiscoveryDocument(
			issuer: issuer,
			authorizationEndpoint: URL(string: "\(issuer)/oauth/v2/authorize")!,
			tokenEndpoint: URL(string: "\(issuer)/oauth/v2/token")!,
			endSessionEndpoint: URL(string: "\(issuer)/oidc/v1/end_session")!
		)

		AuthURLProtocolStub.setHandler(forHost: host) { request in
			let errorJSON = """
			{
				"error": "invalid_grant",
				"error_description": "Refresh token expired or revoked"
			}
			"""
			let response = HTTPURLResponse(
				url: request.url!,
				statusCode: 400,
				httpVersion: nil,
				headerFields: ["Content-Type": "application/json"]
			)!
			return (response, Data(errorJSON.utf8))
		}

		let keychain = InMemoryKeychainStorage()
		let expiredJWT = makeTestJWT(
			iss: issuer,
			exp: Date.now.addingTimeInterval(-100).timeIntervalSince1970
		)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: expiredJWT,
			refreshToken: "rt_revoked",
			expiresAt: Date.now.addingTimeInterval(-100)
		))

		let session = AuthURLProtocolStub.makeStubbedSession()
		let oidcDiscovery = OIDCDiscovery(issuer: config.issuer, session: session, initialDocument: discovery)
		let client = OIDCClient(session: session)

		let sessionEndedCalled = SessionEndedFlag()
		let store = TokenStore(
			config: config,
			discovery: oidcDiscovery,
			client: client,
			keychain: keychain,
			onSessionEnded: {
				sessionEndedCalled.set()
			}
		)

		_ = try await store.restoreFromKeychain()

		await #expect(throws: APIError.self) {
			_ = try await store.validToken()
		}

		let stored = try keychain.readTokens()
		#expect(stored == nil)
		#expect(await store.currentIdToken() == nil)
		#expect(sessionEndedCalled.wasCalled())
	}
}

private final class SessionEndedFlag: @unchecked Sendable {
	private let lock = NSLock()
	private var flag = false

	func set() {
		lock.withLock {
			flag = true
		}
	}

	func wasCalled() -> Bool {
		lock.withLock {
			flag
		}
	}
}
