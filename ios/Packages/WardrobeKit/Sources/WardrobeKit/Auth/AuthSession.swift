import Foundation
import Observation

/// Claims the app shows, from the ID token.
public struct AuthClaims: Codable, Hashable, Sendable {
	public var sub: String
	public var email: String?
	public var preferredUsername: String?
	public var groups: [String]
	public var expiresAt: Date

	public init(sub: String, email: String?, preferredUsername: String?, groups: [String], expiresAt: Date) {
		self.sub = sub
		self.email = email
		self.preferredUsername = preferredUsername
		self.groups = groups
		self.expiresAt = expiresAt
	}
}

/// Presents the system sign-in sheet. The app passes an implementation
/// backed by `ASWebAuthenticationSession` (WP2 provides
/// `WebAuthenticationPresenter`); tests pass a stub.
public protocol AuthPresenter: Sendable {
	/// Opens `url`, waits for a redirect to `callbackScheme`, returns it.
	/// Throws `CancellationError` when the user cancels.
	@MainActor func authenticate(url: URL, callbackScheme: String) async throws -> URL
}

/// The signed-in state and the OIDC flows (docs/ios/api-contract.md "Authentication").
@MainActor
@Observable
public final class AuthSession {
	public enum State: Hashable, Sendable {
		/// Reading the Keychain at launch.
		case restoring
		case signedOut
		case signedIn(AuthClaims)
	}

	public private(set) var state: State = .restoring
	/// Last sign-in failure, for the sign-in screen.
	public private(set) var lastError: String?
	/// Hands tokens to the API client; safe to use from any isolation.
	public nonisolated let tokens: any TokenProvider

	public let config: AppConfig
	/// True for `init(config:signedInAs:)`: no Keychain, no OIDC; `restore`
	/// and `signIn` do nothing and `signOut` only flips `state`.
	public let isStatic: Bool

	private let presenter: any AuthPresenter
	private let tokenStore: TokenStore?
	private let discovery: OIDCDiscovery?
	private let client: OIDCClient?

	public init(
		config: AppConfig,
		presenter: any AuthPresenter,
		keychain: any KeychainStorage = LiveKeychainStorage(),
		session: URLSession = .shared
	) {
		self.config = config
		self.presenter = presenter
		self.isStatic = false

		let discovery = OIDCDiscovery(issuer: config.issuer, session: session)
		let client = OIDCClient(session: session)
		self.discovery = discovery
		self.client = client

		let handler = SessionEndedHandler()
		let store = TokenStore(
			config: config,
			discovery: discovery,
			client: client,
			keychain: keychain,
			onSessionEnded: {
				handler.notify()
			}
		)
		self.tokenStore = store
		self.tokens = store

		handler.setHandler { [weak self] in
			self?.sessionEnded()
		}
	}

	/// Signed in without OIDC: SwiftUI previews, fixture runs and DEBUG runs
	/// against an `AUTH_MODE=dev` server. `tokens` hands out `token`.
	public init(config: AppConfig, signedInAs claims: AuthClaims, token: String = "dev") {
		self.config = config
		self.presenter = StubAuthPresenter()
		self.tokens = StaticTokenProvider(token: token)
		self.tokenStore = nil
		self.discovery = nil
		self.client = nil
		self.state = .signedIn(claims)
		self.isStatic = true
	}

	/// Loads tokens from the Keychain (refreshing if expired) and sets `state`.
	/// Called once at launch.
	public func restore() async {
		guard !isStatic, let tokenStore else {
			if !isStatic { state = .signedOut }
			return
		}

		do {
			guard let stored = try await tokenStore.restoreFromKeychain() else {
				state = .signedOut
				return
			}

			let claims: AuthClaims
			do {
				claims = try IDToken.decodeClaims(idToken: stored.idToken)
			} catch {
				try? await tokenStore.clear()
				state = .signedOut
				return
			}

			if claims.expiresAt > Date.now {
				state = .signedIn(claims)
			} else {
				// Expired ID token with a refresh token refreshes first
				guard stored.refreshToken != nil else {
					try? await tokenStore.clear()
					state = .signedOut
					return
				}
				do {
					_ = try await tokenStore.refreshTokens(rejectionOf: nil)
					if let updatedIdToken = await tokenStore.currentIdToken(),
					   let updatedClaims = try? IDToken.decodeClaims(idToken: updatedIdToken) {
						state = .signedIn(updatedClaims)
					} else {
						state = .signedOut
					}
				} catch let e as APIError where e.isSignedOut {
					state = .signedOut
				} catch let e as AuthError where e.isInvalidGrant {
					state = .signedOut
				} catch {
					// Network failure keeps the session and stays .signedIn with stale claims
					state = .signedIn(claims)
				}
			}
		} catch {
			state = .signedOut
		}
	}

	/// Runs the authorization-code + PKCE flow. Sets `state` on success,
	/// `lastError` on failure; returns quietly when the user cancels.
	public func signIn() async {
		guard !isStatic, let tokenStore, let discovery, let client else {
			return
		}
		lastError = nil

		guard !config.clientID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
			lastError = "Configuration error: missing OIDC client ID."
			return
		}

		do {
			let doc = try await discovery.document()
			let verifier = PKCE.generateCodeVerifier()
			let challenge = PKCE.codeChallenge(for: verifier)
			let state = PKCE.generateRandomString()
			let nonce = PKCE.generateRandomString()

			guard var components = URLComponents(url: doc.authorizationEndpoint, resolvingAgainstBaseURL: true) else {
				throw AuthError.invalidEndpoint("Invalid authorization endpoint")
			}

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

			guard let authURL = components.url else {
				throw AuthError.invalidEndpoint("Failed to construct authorization URL")
			}

			let callbackURL: URL
			do {
				callbackURL = try await presenter.authenticate(url: authURL, callbackScheme: config.callbackScheme)
			} catch is CancellationError {
				return
			} catch {
				let nsError = error as NSError
				if nsError.domain == "com.apple.AuthenticationServices.WebAuthenticationSession" && nsError.code == 1 {
					return
				}
				throw error
			}

			guard let callbackComponents = URLComponents(url: callbackURL, resolvingAgainstBaseURL: true) else {
				throw AuthError.invalidCallback("Invalid callback URL")
			}

			if let errorParam = callbackComponents.queryItems?.first(where: { $0.name == "error" })?.value {
				let desc = callbackComponents.queryItems?.first(where: { $0.name == "error_description" })?.value?.replacingOccurrences(of: "+", with: " ")
				throw AuthError.authorizationFailed(error: errorParam, description: desc)
			}

			guard let returnedState = callbackComponents.queryItems?.first(where: { $0.name == "state" })?.value,
				  returnedState == state else {
				throw AuthError.stateMismatch
			}

			guard let code = callbackComponents.queryItems?.first(where: { $0.name == "code" })?.value else {
				throw AuthError.missingAuthorizationCode
			}

			let response = try await client.exchangeCode(
				tokenEndpoint: doc.tokenEndpoint,
				code: code,
				codeVerifier: verifier,
				clientID: config.clientID,
				redirectURI: config.redirectURI
			)

			let claims = try IDToken.decodeAndValidate(
				idToken: response.idToken,
				expectedIssuer: doc.issuer,
				expectedClientID: config.clientID,
				expectedNonce: nonce
			)

			try await tokenStore.setTokens(
				idToken: response.idToken,
				refreshToken: response.refreshToken,
				expiresAt: claims.expiresAt
			)

			self.state = .signedIn(claims)
		} catch is CancellationError {
			return
		} catch {
			lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}

	/// End-session in the browser, then clears the Keychain.
	public func signOut() async {
		guard !isStatic, let tokenStore else {
			state = .signedOut
			return
		}

		let idToken = await tokenStore.currentIdToken()

		if let doc = try? await discovery?.document(),
		   let endSession = doc.endSessionEndpoint {
			var components = URLComponents(url: endSession, resolvingAgainstBaseURL: true)
			var items: [URLQueryItem] = [
				URLQueryItem(name: "client_id", value: config.clientID),
				URLQueryItem(name: "post_logout_redirect_uri", value: config.postLogoutRedirectURI.absoluteString),
			]
			if let idToken {
				items.append(URLQueryItem(name: "id_token_hint", value: idToken))
			}
			components?.queryItems = items
			if let logoutURL = components?.url {
				let scheme = config.postLogoutRedirectURI.scheme ?? "xyz.vidur.wardrobe"
				_ = try? await presenter.authenticate(url: logoutURL, callbackScheme: scheme)
			}
		}

		try? await tokenStore.clear()
		state = .signedOut
	}

	/// Called by the app when the API reports the session is over.
	public func sessionEnded() {
		state = .signedOut
		if let tokenStore {
			Task {
				try? await tokenStore.clear()
			}
		}
	}

	public var claims: AuthClaims? {
		if case .signedIn(let c) = state { c } else { nil }
	}
}

// MARK: - Internal Helpers

private struct StubAuthPresenter: AuthPresenter {
	func authenticate(url: URL, callbackScheme: String) async throws -> URL {
		throw CancellationError()
	}
}

final class SessionEndedHandler: @unchecked Sendable {
	private let lock = NSLock()
	private var handler: (@MainActor () -> Void)?

	func setHandler(_ handler: @escaping @MainActor () -> Void) {
		lock.withLock {
			self.handler = handler
		}
	}

	@MainActor
	func notify() {
		let h = lock.withLock { handler }
		h?()
	}
}
