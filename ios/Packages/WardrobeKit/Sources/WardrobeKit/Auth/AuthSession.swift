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
		self.sub = sub; self.email = email; self.preferredUsername = preferredUsername
		self.groups = groups; self.expiresAt = expiresAt
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

/// The signed-in state and the OIDC flows (docs/ios/api-contract.md
/// "Authentication"). Shell from WP0; WP2 implements it — the public API
/// below is the contract other packages use.
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

	public init(config: AppConfig, presenter: any AuthPresenter) {
		self.config = config
		self.tokens = UnimplementedTokenProvider()
		self.isStatic = false
	}

	/// Signed in without OIDC: SwiftUI previews, fixture runs and DEBUG runs
	/// against an `AUTH_MODE=dev` server. `tokens` hands out `token`.
	public init(config: AppConfig, signedInAs claims: AuthClaims, token: String = "dev") {
		self.config = config
		self.tokens = StaticTokenProvider(token: token)
		self.state = .signedIn(claims)
		self.isStatic = true
	}

	/// Loads tokens from the Keychain (refreshing if expired) and sets
	/// `state`. Called once at launch.
	public func restore() async { if !isStatic { state = .signedOut } }

	/// Runs the authorization-code + PKCE flow. Sets `state` on success,
	/// `lastError` on failure; returns quietly when the user cancels.
	public func signIn() async { lastError = "Sign-in is not implemented yet." }

	/// End-session in the browser, then clears the Keychain.
	public func signOut() async { state = .signedOut }

	/// Called by the app when the API reports the session is over.
	public func sessionEnded() { state = .signedOut }

	public var claims: AuthClaims? {
		if case .signedIn(let c) = state { c } else { nil }
	}
}

struct UnimplementedTokenProvider: TokenProvider {
	func validToken() async throws -> String { throw APIError.signedOut }
	func refreshAfterRejection(of rejected: String) async throws -> String { throw APIError.signedOut }
}
