import Foundation
#if canImport(AuthenticationServices)
import AuthenticationServices
#endif
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit) && !targetEnvironment(macCatalyst)
import AppKit
#endif

/// `AuthPresenter` backed by `ASWebAuthenticationSession` (shares the Safari
/// cookie jar so an existing Zitadel session is reused).
public struct WebAuthenticationPresenter: AuthPresenter, Sendable {
	public init() {}

	@MainActor
	public func authenticate(url: URL, callbackScheme: String) async throws -> URL {
		#if canImport(AuthenticationServices)
		let runner = SessionRunner()
		return try await runner.authenticate(url: url, callbackScheme: callbackScheme)
		#else
		throw APIError(status: 501, error: "unimplemented", message: "AuthenticationServices is not available")
		#endif
	}
}

#if canImport(AuthenticationServices)
@MainActor
private final class SessionRunner: NSObject, ASWebAuthenticationPresentationContextProviding {
	private var session: ASWebAuthenticationSession?

	func authenticate(url: URL, callbackScheme: String) async throws -> URL {
		try await withCheckedThrowingContinuation { continuation in
			let authSession = ASWebAuthenticationSession(
				url: url,
				callback: .customScheme(callbackScheme)
			) { [weak self] callbackURL, error in
				self?.session = nil
				if let error {
					if let authError = error as? ASWebAuthenticationSessionError,
					   authError.code == .canceledLogin {
						continuation.resume(throwing: CancellationError())
					} else {
						continuation.resume(throwing: error)
					}
				} else if let callbackURL {
					continuation.resume(returning: callbackURL)
				} else {
					continuation.resume(throwing: CancellationError())
				}
			}
			authSession.presentationContextProvider = self
			authSession.prefersEphemeralWebBrowserSession = false
			self.session = authSession
			if !authSession.start() {
				self.session = nil
				continuation.resume(throwing: APIError(
					status: 500,
					error: "auth_failed",
					message: "Failed to start web authentication session"
				))
			}
		}
	}

	func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
		#if canImport(UIKit) && !os(watchOS)
		let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
		for scene in scenes {
			if let keyWindow = scene.windows.first(where: { $0.isKeyWindow }) {
				return keyWindow
			}
			if let firstWindow = scene.windows.first {
				return firstWindow
			}
		}
		if let scene = scenes.first {
			return UIWindow(windowScene: scene)
		}
		assertionFailure("No UIWindowScene available for authentication presentation anchor")
		return scenes.first.map(UIWindow.init(windowScene:)) ?? UIWindow(frame: .zero)
		#elseif canImport(AppKit) && !targetEnvironment(macCatalyst)
		return NSApplication.shared.windows.first ?? NSWindow()
		#else
		return ASPresentationAnchor()
		#endif
	}
}
#endif
