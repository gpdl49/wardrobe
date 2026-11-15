import Foundation

// MARK: - TokenStore Actor

/// Actor managing token persistence, proactive refresh, single-flight refresh,
/// and refresh token rotation per docs/ios/api-contract.md "Authentication".
public actor TokenStore: TokenProvider {
	private let config: AppConfig
	private let discovery: OIDCDiscovery
	private let client: OIDCClient
	private let keychain: any KeychainStorage
	private let onSessionEnded: (@Sendable @MainActor () -> Void)?

	private var tokens: StoredAuthTokens?
	private var refreshTask: Task<String, any Error>?

	public init(
		config: AppConfig,
		discovery: OIDCDiscovery,
		client: OIDCClient,
		keychain: any KeychainStorage,
		onSessionEnded: (@Sendable @MainActor () -> Void)? = nil
	) {
		self.config = config
		self.discovery = discovery
		self.client = client
		self.keychain = keychain
		self.onSessionEnded = onSessionEnded
	}

	// MARK: - TokenProvider

	/// Returns a currently valid ID token, proactively refreshing when expiring in under 5 minutes.
	/// Throws `APIError.signedOut` when there is no session.
	public func validToken() async throws -> String {
		guard let current = tokens else {
			throw APIError.signedOut
		}

		// Proactive refresh (<5 minutes before expiration)
		if current.expiresAt.timeIntervalSinceNow < 300 {
			return try await refreshTokens(rejectionOf: nil)
		}

		return current.idToken
	}

	/// Called once when the server refused `rejected`. Refreshes and returns a new token,
	/// unless another concurrent refresh has already produced a newer token.
	public func refreshAfterRejection(of rejected: String) async throws -> String {
		if let current = tokens, current.idToken != rejected {
			return current.idToken
		}
		return try await refreshTokens(rejectionOf: rejected)
	}

	// MARK: - Refresh Logic

	/// Refreshes tokens with single-flight semantics.
	public func refreshTokens(rejectionOf rejected: String? = nil) async throws -> String {
		// If another caller already refreshed the token after the rejected one was issued, reuse it.
		if let rejected, let current = tokens, current.idToken != rejected {
			return current.idToken
		}

		if let ongoing = refreshTask {
			return try await ongoing.value
		}

		let task = Task { [weak self] () -> String in
			guard let self else { throw APIError.signedOut }
			return try await self.executeRefresh()
		}
		self.refreshTask = task

		do {
			let token = try await task.value
			self.refreshTask = nil
			return token
		} catch {
			self.refreshTask = nil
			throw error
		}
	}

	private func executeRefresh() async throws -> String {
		guard let currentRefreshToken = tokens?.refreshToken else {
			try? keychain.clearTokens()
			self.tokens = nil
			if let onSessionEnded {
				await onSessionEnded()
			}
			throw APIError.signedOut
		}

		let doc = try await discovery.document()
		do {
			let response = try await client.refreshToken(
				tokenEndpoint: doc.tokenEndpoint,
				refreshToken: currentRefreshToken,
				clientID: config.clientID
			)

			let newClaims = try IDToken.decodeAndValidate(
				idToken: response.idToken,
				expectedIssuer: doc.issuer,
				expectedClientID: config.clientID
			)

			// Refresh token rotation: Zitadel rotates refresh tokens, so always store the new one.
			let rotatedRefreshToken = response.refreshToken ?? currentRefreshToken
			let updated = StoredAuthTokens(
				idToken: response.idToken,
				refreshToken: rotatedRefreshToken,
				expiresAt: newClaims.expiresAt
			)
			self.tokens = updated
			try keychain.saveTokens(updated)
			return response.idToken
		} catch let error as AuthError where error.isInvalidGrant {
			try? keychain.clearTokens()
			self.tokens = nil
			if let onSessionEnded {
				await onSessionEnded()
			}
			throw APIError.signedOut
		} catch {
			throw error
		}
	}

	// MARK: - Storage Management

	/// Restores tokens from Keychain storage.
	public func restoreFromKeychain() throws -> StoredAuthTokens? {
		let stored = try keychain.readTokens()
		self.tokens = stored
		return stored
	}

	/// Saves newly obtained tokens in memory and in the Keychain.
	public func setTokens(idToken: String, refreshToken: String?, expiresAt: Date) throws {
		let stored = StoredAuthTokens(idToken: idToken, refreshToken: refreshToken, expiresAt: expiresAt)
		self.tokens = stored
		try keychain.saveTokens(stored)
	}

	/// Clears tokens from memory and the Keychain.
	public func clear() throws {
		self.tokens = nil
		self.refreshTask = nil
		try keychain.clearTokens()
	}

	/// Current ID token in memory, if any.
	public func currentIdToken() -> String? {
		tokens?.idToken
	}

	/// Current stored tokens in memory, if any.
	public func currentTokens() -> StoredAuthTokens? {
		tokens
	}
}
