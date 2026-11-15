import Foundation
import Testing
@testable import WardrobeKit

@Suite struct AuthSessionTests {
	// MARK: - Restore Paths

	@Test @MainActor func restoreWithEmptyKeychainSetsSignedOut() async throws {
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://session-empty.vidur.xyz")!,
			clientID: "wardrobe-ios"
		)
		let keychain = InMemoryKeychainStorage()
		let presenter = TestAuthPresenter()
		let session = AuthSession(config: config, presenter: presenter, keychain: keychain)

		await session.restore()
		#expect(session.state == .signedOut)
		#expect(session.claims == nil)
	}

	@Test @MainActor func restoreWithValidTokenSetsSignedIn() async throws {
		let host = "session-restore-valid.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)
		let keychain = InMemoryKeychainStorage()
		let futureExp = Date.now.addingTimeInterval(3600).timeIntervalSince1970
		let jwt = makeTestJWT(sub: "usr_restore_valid", iss: issuer, exp: futureExp)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: jwt,
			refreshToken: "rt_valid",
			expiresAt: Date(timeIntervalSince1970: futureExp)
		))

		let presenter = TestAuthPresenter()
		let session = AuthSession(config: config, presenter: presenter, keychain: keychain)

		await session.restore()

		guard case .signedIn(let claims) = session.state else {
			Issue.record("Expected .signedIn state")
			return
		}
		#expect(claims.sub == "usr_restore_valid")
	}

	@Test @MainActor func restoreWithExpiredTokenRefreshesSuccessfully() async throws {
		let host = "session-restore-refresh.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""
		let newJWT = makeTestJWT(
			sub: "usr_refreshed_on_restore",
			iss: issuer,
			exp: Date.now.addingTimeInterval(3600).timeIntervalSince1970
		)

		AuthURLProtocolStub.setHandler(forHost: host) { request in
			if request.url?.path == "/.well-known/openid-configuration" {
				let res = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
				return (res, Data(discoveryJSON.utf8))
			}
			let responseJSON = """
			{
				"id_token": "\(newJWT)",
				"refresh_token": "rt_new_restore",
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
		let expiredJWT = makeTestJWT(sub: "usr_old", iss: issuer, exp: Date.now.addingTimeInterval(-100).timeIntervalSince1970)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: expiredJWT,
			refreshToken: "rt_old",
			expiresAt: Date.now.addingTimeInterval(-100)
		))

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let presenter = TestAuthPresenter()
		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.restore()

		guard case .signedIn(let claims) = session.state else {
			Issue.record("Expected .signedIn state after successful refresh")
			return
		}
		#expect(claims.sub == "usr_refreshed_on_restore")

		let stored = try keychain.readTokens()
		#expect(stored?.refreshToken == "rt_new_restore")
	}

	@Test @MainActor func restoreWithExpiredTokenInvalidGrantSetsSignedOut() async throws {
		let host = "session-restore-invalidgrant.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""

		AuthURLProtocolStub.setHandler(forHost: host) { request in
			if request.url?.path == "/.well-known/openid-configuration" {
				let res = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
				return (res, Data(discoveryJSON.utf8))
			}
			let errorJSON = """
			{
				"error": "invalid_grant",
				"error_description": "Refresh token revoked"
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
		let expiredJWT = makeTestJWT(sub: "usr_old", iss: issuer, exp: Date.now.addingTimeInterval(-100).timeIntervalSince1970)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: expiredJWT,
			refreshToken: "rt_revoked",
			expiresAt: Date.now.addingTimeInterval(-100)
		))

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let presenter = TestAuthPresenter()
		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.restore()
		#expect(session.state == .signedOut)
		#expect(try keychain.readTokens() == nil)
	}

	@Test @MainActor func restoreWithExpiredTokenNetworkFailureStaysSignedInWithStaleClaims() async throws {
		let host = "session-restore-network.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		AuthURLProtocolStub.setHandler(forHost: host) { _ in
			throw URLError(.notConnectedToInternet)
		}

		let keychain = InMemoryKeychainStorage()
		let expiredJWT = makeTestJWT(sub: "usr_stale", iss: issuer, exp: Date.now.addingTimeInterval(-100).timeIntervalSince1970)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: expiredJWT,
			refreshToken: "rt_stale",
			expiresAt: Date.now.addingTimeInterval(-100)
		))

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let presenter = TestAuthPresenter()
		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.restore()

		guard case .signedIn(let claims) = session.state else {
			Issue.record("Expected .signedIn state with stale claims on network error")
			return
		}
		#expect(claims.sub == "usr_stale")
		#expect(try keychain.readTokens() != nil)
	}

	@Test @MainActor func staticSessionSemantics() async {
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: "wardrobe-ios"
		)
		let claims = AuthClaims(
			sub: "static_user",
			email: "static@localhost",
			preferredUsername: "static",
			groups: ["wardrobe"],
			expiresAt: .distantFuture
		)
		let session = AuthSession(config: config, signedInAs: claims, token: "dev-token")

		#expect(session.isStatic)
		#expect(session.state == .signedIn(claims))

		await session.restore()
		#expect(session.state == .signedIn(claims))

		await session.signIn()
		#expect(session.state == .signedIn(claims))
		#expect(session.lastError == nil)

		await session.signOut()
		#expect(session.state == .signedOut)
	}

	// MARK: - Sign-In

	@Test @MainActor func signInHappyPath() async throws {
		let host = "session-signin-happy.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""

		final class CapturedState: @unchecked Sendable {
			private let lock = NSLock()
			private var nonce: String?
			private var challenge: String?
			func setNonce(_ n: String?) { lock.withLock { nonce = n } }
			func getNonce() -> String? { lock.withLock { nonce } }
			func setChallenge(_ value: String?) { lock.withLock { challenge = value } }
			func getChallenge() -> String? { lock.withLock { challenge } }
		}
		let captured = CapturedState()

		AuthURLProtocolStub.setHandler(forHost: host) { req in
			if req.url?.path == "/.well-known/openid-configuration" {
				let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
				return (res, Data(discoveryJSON.utf8))
			}

			let bodyData = readRequestBody(from: req)
			let body = String(decoding: bodyData, as: UTF8.self)
			#expect(body.contains("grant_type=authorization_code"))
			#expect(body.contains("code=auth_code_123"))
			let values = URLComponents(string: "https://example.test/?" + body)?.queryItems ?? []
			let verifier = values.first { $0.name == "code_verifier" }?.value ?? ""
			#expect(!verifier.isEmpty)
			#expect(PKCE.codeChallenge(for: verifier) == captured.getChallenge())

			let newJWT = makeTestJWT(
				sub: "usr_signin_success",
				email: "user@example.com",
				preferredUsername: "username",
				groups: ["wardrobe"],
				iss: issuer,
				aud: ["wardrobe-ios"],
				exp: Date.now.addingTimeInterval(3600).timeIntervalSince1970,
				nonce: captured.getNonce()
			)

			let tokenResponseJSON = """
			{
				"id_token": "\(newJWT)",
				"refresh_token": "rt_first_login",
				"token_type": "Bearer",
				"expires_in": 3600
			}
			"""
			let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
			return (res, Data(tokenResponseJSON.utf8))
		}

		let presenter = TestAuthPresenter(onAuthenticate: { url, scheme in
			let components = URLComponents(url: url, resolvingAgainstBaseURL: true)!
			#expect(url.path == "/oauth/v2/authorize")
			#expect(scheme == "xyz.vidur.wardrobe")
			let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
			#expect(query["client_id"] == "wardrobe-ios")
			#expect(query["redirect_uri"] == "xyz.vidur.wardrobe://oauth/callback")
			#expect(query["scope"] == "openid email profile offline_access")
			#expect(query["response_type"] == "code")
			#expect(query["code_challenge_method"] == "S256")
			captured.setChallenge(query["code_challenge"])
			let state = components.queryItems?.first(where: { $0.name == "state" })?.value ?? ""
			let nonce = components.queryItems?.first(where: { $0.name == "nonce" })?.value
			captured.setNonce(nonce)
			return URL(string: "xyz.vidur.wardrobe://oauth/callback?code=auth_code_123&state=\(state)")!
		})

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let keychain = InMemoryKeychainStorage()

		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.signIn()

		#expect(session.lastError == nil)
		guard case .signedIn(let claims) = session.state else {
			Issue.record("Expected .signedIn state after signIn()")
			return
		}
		#expect(claims.sub == "usr_signin_success")
		#expect(claims.email == "user@example.com")
		#expect(claims.groups == ["wardrobe"])

		let stored = try keychain.readTokens()
		#expect(stored?.refreshToken == "rt_first_login")
	}

	@Test @MainActor func signInUserCancellationIsQuiet() async throws {
		let host = "session-signin-cancel.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""
		AuthURLProtocolStub.setHandler(forHost: host) { req in
			let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
			return (res, Data(discoveryJSON.utf8))
		}

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let keychain = InMemoryKeychainStorage()
		let presenter = TestAuthPresenter(result: .failure(CancellationError()))

		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.signIn()

		#expect(session.lastError == nil)
		#expect(session.state == .restoring)
	}

	@Test @MainActor func signInStateMismatchSetsLastError() async throws {
		let host = "session-signin-mismatch.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""
		AuthURLProtocolStub.setHandler(forHost: host) { req in
			let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
			return (res, Data(discoveryJSON.utf8))
		}

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let keychain = InMemoryKeychainStorage()
		let presenter = TestAuthPresenter(result: .success(
			URL(string: "xyz.vidur.wardrobe://oauth/callback?code=abc&state=tampered_state")!
		))

		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.signIn()

		#expect(session.lastError != nil)
		#expect(session.lastError?.contains("state mismatch") == true)
	}

	@Test @MainActor func signInCallbackErrorSetsLastError() async throws {
		let host = "session-signin-error.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""
		AuthURLProtocolStub.setHandler(forHost: host) { req in
			let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
			return (res, Data(discoveryJSON.utf8))
		}

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let keychain = InMemoryKeychainStorage()
		let presenter = TestAuthPresenter(result: .success(
			URL(string: "xyz.vidur.wardrobe://oauth/callback?error=invalid_request&error_description=Missing+parameter")!
		))

		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.signIn()

		#expect(session.lastError == "Missing parameter")
	}

	@Test @MainActor func signInMissingClientIDShowsConfigError() async {
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: ""
		)

		let presenter = TestAuthPresenter()
		let session = AuthSession(config: config, presenter: presenter)

		await session.signIn()
		#expect(session.lastError?.contains("missing OIDC client ID") == true)
	}

	// MARK: - Sign-Out

	@Test @MainActor func signOutOpensEndSessionAndClearsKeychain() async throws {
		let host = "session-signout-happy.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios",
			postLogoutRedirectURI: URL(string: "xyz.vidur.wardrobe://oauth/logout")!
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""
		AuthURLProtocolStub.setHandler(forHost: host) { req in
			let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
			return (res, Data(discoveryJSON.utf8))
		}

		let keychain = InMemoryKeychainStorage()
		let jwt = makeTestJWT(sub: "usr_signout", iss: issuer)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: jwt,
			refreshToken: "rt_123",
			expiresAt: Date.now.addingTimeInterval(3600)
		))

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let presenter = TestAuthPresenter(result: .success(
			URL(string: "xyz.vidur.wardrobe://oauth/logout")!
		))

		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.restore()
		guard case .signedIn = session.state else {
			Issue.record("Should be signed in")
			return
		}

		await session.signOut()

		#expect(session.state == .signedOut)
		#expect(try keychain.readTokens() == nil)

		let logoutURL = presenter.lastPresentedURL
		#expect(logoutURL != nil)
		let components = URLComponents(url: logoutURL!, resolvingAgainstBaseURL: true)!
		#expect(components.queryItems?.first(where: { $0.name == "id_token_hint" })?.value == jwt)
		#expect(components.queryItems?.first(where: { $0.name == "client_id" })?.value == "wardrobe-ios")
		#expect(components.queryItems?.first(where: { $0.name == "post_logout_redirect_uri" })?.value == "xyz.vidur.wardrobe://oauth/logout")
	}

	@Test @MainActor func signOutClearsKeychainEvenIfPresenterFails() async throws {
		let host = "session-signout-fail.vidur.xyz"
		let issuer = "https://\(host)"
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: issuer)!,
			clientID: "wardrobe-ios"
		)

		let discoveryJSON = """
		{
			"issuer": "\(issuer)",
			"authorization_endpoint": "\(issuer)/oauth/v2/authorize",
			"token_endpoint": "\(issuer)/oauth/v2/token",
			"end_session_endpoint": "\(issuer)/oidc/v1/end_session"
		}
		"""
		AuthURLProtocolStub.setHandler(forHost: host) { req in
			let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
			return (res, Data(discoveryJSON.utf8))
		}

		let keychain = InMemoryKeychainStorage()
		let jwt = makeTestJWT(sub: "usr_signout_fail", iss: issuer)
		try keychain.saveTokens(StoredAuthTokens(
			idToken: jwt,
			refreshToken: "rt_123",
			expiresAt: Date.now.addingTimeInterval(3600)
		))

		let stubbedSession = AuthURLProtocolStub.makeStubbedSession()
		let presenter = TestAuthPresenter(result: .failure(CancellationError()))

		let session = AuthSession(
			config: config,
			presenter: presenter,
			keychain: keychain,
			session: stubbedSession
		)

		await session.restore()
		await session.signOut()

		#expect(session.state == .signedOut)
		#expect(try keychain.readTokens() == nil)
	}

	@Test @MainActor func sessionEndedSetsSignedOut() async throws {
		let config = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: "wardrobe-ios"
		)
		let keychain = InMemoryKeychainStorage()
		let jwt = makeTestJWT(sub: "usr_session_ended")
		try keychain.saveTokens(StoredAuthTokens(
			idToken: jwt,
			refreshToken: "rt_123",
			expiresAt: Date.now.addingTimeInterval(3600)
		))

		let presenter = TestAuthPresenter()
		let session = AuthSession(config: config, presenter: presenter, keychain: keychain)

		await session.restore()
		guard case .signedIn = session.state else {
			Issue.record("Should be signed in")
			return
		}

		session.sessionEnded()
		#expect(session.state == .signedOut)
	}
}
