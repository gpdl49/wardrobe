import Foundation

// MARK: - OIDCDiscoveryDocument

public struct OIDCDiscoveryDocument: Codable, Hashable, Sendable {
	public var issuer: String
	public var authorizationEndpoint: URL
	public var tokenEndpoint: URL
	public var endSessionEndpoint: URL?

	public init(
		issuer: String,
		authorizationEndpoint: URL,
		tokenEndpoint: URL,
		endSessionEndpoint: URL? = nil
	) {
		self.issuer = issuer
		self.authorizationEndpoint = authorizationEndpoint
		self.tokenEndpoint = tokenEndpoint
		self.endSessionEndpoint = endSessionEndpoint
	}

	enum CodingKeys: String, CodingKey {
		case issuer
		case authorizationEndpoint = "authorization_endpoint"
		case tokenEndpoint = "token_endpoint"
		case endSessionEndpoint = "end_session_endpoint"
	}
}

// MARK: - OIDCDiscovery Actor

/// Loads and caches the OpenID configuration for the process lifetime.
public actor OIDCDiscovery {
	private let issuer: URL
	private let session: URLSession
	private var cachedDocument: OIDCDiscoveryDocument?

	public init(issuer: URL, session: URLSession = .shared, initialDocument: OIDCDiscoveryDocument? = nil) {
		self.issuer = issuer
		self.session = session
		self.cachedDocument = initialDocument
	}

	public func document() async throws -> OIDCDiscoveryDocument {
		if let cachedDocument {
			return cachedDocument
		}
		let docURL = discoveryURL(for: issuer)
		var request = URLRequest(url: docURL)
		request.setValue("application/json", forHTTPHeaderField: "Accept")

		let data: Data
		let response: URLResponse
		do {
			(data, response) = try await session.data(for: request)
		} catch {
			throw APIError(status: 0, error: "network", message: error.localizedDescription)
		}

		guard let httpResponse = response as? HTTPURLResponse else {
			throw APIError(status: 0, error: "network", message: "Invalid response from discovery endpoint")
		}

		guard (200...299).contains(httpResponse.statusCode) else {
			throw APIError(
				status: httpResponse.statusCode,
				error: "discovery_failed",
				message: "Discovery endpoint returned HTTP \(httpResponse.statusCode)"
			)
		}

		do {
			let doc = try JSONDecoder().decode(OIDCDiscoveryDocument.self, from: data)
			self.cachedDocument = doc
			return doc
		} catch {
			throw APIError(
				status: httpResponse.statusCode,
				error: "decoding",
				message: "Failed to decode discovery document: \(error.localizedDescription)"
			)
		}
	}

	private func discoveryURL(for issuer: URL) -> URL {
		let base = issuer.absoluteString.hasSuffix("/") ? String(issuer.absoluteString.dropLast()) : issuer.absoluteString
		return URL(string: "\(base)/.well-known/openid-configuration")!
	}
}
