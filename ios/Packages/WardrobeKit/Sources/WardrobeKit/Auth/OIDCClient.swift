import Foundation

// MARK: - Token Response & Error

public struct OIDCTokenResponse: Codable, Sendable {
	public var idToken: String
	public var refreshToken: String?
	public var accessToken: String?
	public var tokenType: String?
	public var expiresIn: Int?

	public init(
		idToken: String,
		refreshToken: String? = nil,
		accessToken: String? = nil,
		tokenType: String? = nil,
		expiresIn: Int? = nil
	) {
		self.idToken = idToken
		self.refreshToken = refreshToken
		self.accessToken = accessToken
		self.tokenType = tokenType
		self.expiresIn = expiresIn
	}

	enum CodingKeys: String, CodingKey {
		case idToken = "id_token"
		case refreshToken = "refresh_token"
		case accessToken = "access_token"
		case tokenType = "token_type"
		case expiresIn = "expires_in"
	}
}

public struct OIDCErrorResponse: Codable, Sendable {
	public var error: String
	public var errorDescription: String?

	public init(error: String, errorDescription: String? = nil) {
		self.error = error
		self.errorDescription = errorDescription
	}

	enum CodingKeys: String, CodingKey {
		case error
		case errorDescription = "error_description"
	}
}

// MARK: - OIDCClient

/// Performs HTTP token exchanges and refreshes against the OIDC token endpoint.
public struct OIDCClient: Sendable {
	private let session: URLSession

	public init(session: URLSession = .shared) {
		self.session = session
	}

	/// Exchanges an authorization code for tokens using PKCE.
	public func exchangeCode(
		tokenEndpoint: URL,
		code: String,
		codeVerifier: String,
		clientID: String,
		redirectURI: URL
	) async throws -> OIDCTokenResponse {
		let parameters: [(String, String)] = [
			("grant_type", "authorization_code"),
			("client_id", clientID),
			("code", code),
			("redirect_uri", redirectURI.absoluteString),
			("code_verifier", codeVerifier),
		]
		return try await postForm(url: tokenEndpoint, parameters: parameters)
	}

	/// Refreshes an expired ID token with a refresh token.
	public func refreshToken(
		tokenEndpoint: URL,
		refreshToken: String,
		clientID: String
	) async throws -> OIDCTokenResponse {
		let parameters: [(String, String)] = [
			("grant_type", "refresh_token"),
			("client_id", clientID),
			("refresh_token", refreshToken),
		]
		return try await postForm(url: tokenEndpoint, parameters: parameters)
	}

	private func postForm(url: URL, parameters: [(String, String)]) async throws -> OIDCTokenResponse {
		var request = URLRequest(url: url)
		request.httpMethod = "POST"
		request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
		request.setValue("application/json", forHTTPHeaderField: "Accept")
		request.httpBody = formURLEncode(parameters)

		let data: Data
		let response: URLResponse
		do {
			(data, response) = try await session.data(for: request)
		} catch {
			throw APIError(status: 0, error: "network", message: error.localizedDescription)
		}

		guard let httpResponse = response as? HTTPURLResponse else {
			throw APIError(status: 0, error: "network", message: "Invalid HTTP response from token endpoint")
		}

		if (200...299).contains(httpResponse.statusCode) {
			do {
				return try JSONDecoder().decode(OIDCTokenResponse.self, from: data)
			} catch {
				throw APIError(
					status: httpResponse.statusCode,
					error: "decoding",
					message: "Failed to decode token response: \(error.localizedDescription)"
				)
			}
		}

		// Non-2xx response: attempt to decode OAuth error response
		if let errorResponse = try? JSONDecoder().decode(OIDCErrorResponse.self, from: data) {
			if errorResponse.error == "invalid_grant" {
				throw AuthError.invalidGrant(description: errorResponse.errorDescription ?? "invalid_grant")
			}
			throw AuthError.tokenRequestFailed(
				status: httpResponse.statusCode,
				error: errorResponse.error,
				description: errorResponse.errorDescription
			)
		}

		throw APIError(
			status: httpResponse.statusCode,
			error: "http_\(httpResponse.statusCode)",
			message: "Token endpoint returned HTTP \(httpResponse.statusCode)"
		)
	}

	private func formURLEncode(_ parameters: [(String, String)]) -> Data {
		let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
		let bodyString = parameters.map { key, value in
			let escapedKey = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
			let escapedValue = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
			return "\(escapedKey)=\(escapedValue)"
		}.joined(separator: "&")
		return Data(bodyString.utf8)
	}
}
