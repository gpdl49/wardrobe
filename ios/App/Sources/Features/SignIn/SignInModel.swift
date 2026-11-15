import Foundation
import Observation
import WardrobeKit

/// State and helpers for `SignInView` (WP8).
@MainActor
@Observable
final class SignInModel {
	var isSigningIn: Bool = false

	private let auth: AuthSession

	init(auth: AuthSession) {
		self.auth = auth
	}

	var isConfigured: Bool {
		!auth.config.clientID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
	}

	var lastError: String? {
		auth.lastError
	}

	func signIn() async {
		guard isConfigured else { return }
		isSigningIn = true
		await auth.signIn()
		isSigningIn = false
	}
}
