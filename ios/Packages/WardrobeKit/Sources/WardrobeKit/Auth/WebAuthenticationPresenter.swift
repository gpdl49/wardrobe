import Foundation

/// `AuthPresenter` backed by `ASWebAuthenticationSession` (shares the Safari
/// cookie jar so an existing Zitadel session is reused). Shell from WP0; WP2
/// implements.
public struct WebAuthenticationPresenter: AuthPresenter {
	public init() {}
	@MainActor public func authenticate(url: URL, callbackScheme: String) async throws -> URL {
		throw APIError(status: 501, error: "unimplemented", message: "Sign-in is not implemented yet")
	}
}
