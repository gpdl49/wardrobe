import SwiftUI
import WardrobeKit

/// Signed-out screen (WP8).
struct SignInView: View {
	@Environment(AuthSession.self) private var auth
	var body: some View {
		VStack(spacing: 16) {
			Text("Wardrobe").font(.largeTitle.bold())
			Button("Sign in with Centerpoint") { Task { await auth.signIn() } }.buttonStyle(.borderedProminent)
			if let e = auth.lastError { Text(e).foregroundStyle(.red) }
		}
	}
}
