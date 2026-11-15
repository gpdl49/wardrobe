import SwiftUI
import WardrobeKit
import WardrobeKitTesting

/// Signed in, but without the `wardrobe` role (WP8).
struct NoAccessView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(AuthSession.self) private var auth

	var body: some View {
		VStack(spacing: 32) {
			Spacer()

			VStack(spacing: 16) {
				Image(systemName: "lock.shield.fill")
					.font(.system(size: 64))
					.foregroundStyle(.orange)

				Text("Access Required")
					.font(.title.bold())

				Text("Your Centerpoint account doesn't have access to Wardrobe. You need the 'wardrobe' role to use this app.")
					.font(.body)
					.foregroundStyle(.secondary)
					.multilineTextAlignment(.center)
					.padding(.horizontal, 24)
			}

			accountCard

			Spacer()

			Button(role: .destructive) {
				Task { await appModel.signOut() }
			} label: {
				Text("Sign out")
					.font(.headline)
					.frame(maxWidth: .infinity)
					.padding(.vertical, 4)
			}
			.buttonStyle(.bordered)
			.controlSize(.large)
			.padding(.horizontal, 32)
			.padding(.bottom, 24)
		}
	}

	private var accountCard: some View {
		VStack(spacing: 8) {
			Text("Signed in as")
				.font(.caption)
				.foregroundStyle(.secondary)

			Text(accountLabel)
				.font(.headline)

			if let email = auth.claims?.email, email != accountLabel {
				Text(email)
					.font(.subheadline)
					.foregroundStyle(.secondary)
			}
		}
		.padding()
		.frame(maxWidth: .infinity)
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.padding(.horizontal, 32)
	}

	private var accountLabel: String {
		auth.claims?.preferredUsername ?? auth.claims?.email ?? auth.claims?.sub ?? "Current user"
	}
}

// MARK: - Previews

#Preview {
	NoAccessView()
		.environment(AppModel.preview())
		.environment(AppModel.preview().auth)
}
