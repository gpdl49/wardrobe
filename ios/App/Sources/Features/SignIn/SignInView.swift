import SwiftUI
import WardrobeKit
import WardrobeKitTesting

/// Signed-out screen (WP8).
struct SignInView: View {
	@Environment(AuthSession.self) private var auth
	@State private var viewModel: SignInModel?

	var body: some View {
		Group {
			if let viewModel {
				SignInContent(viewModel: viewModel)
			} else {
				ProgressView()
			}
		}
		.task {
			if viewModel == nil {
				viewModel = SignInModel(auth: auth)
			}
		}
	}
}

// MARK: - Content

private struct SignInContent: View {
	@Bindable var viewModel: SignInModel

	var body: some View {
		VStack(spacing: 32) {
			Spacer()

			VStack(spacing: 16) {
				Image(systemName: "tshirt.fill")
					.font(.system(size: 72))
					.foregroundStyle(.tint)
					.padding()
					.background(Color.accentColor.opacity(0.12))
					.clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

				Text("Wardrobe")
					.font(.largeTitle.bold())

				Text("Organise, pack and share your clothes")
					.font(.subheadline)
					.foregroundStyle(.secondary)
			}

			Spacer()

			VStack(spacing: 16) {
				if viewModel.isConfigured {
					Button {
						Task { await viewModel.signIn() }
					} label: {
						HStack {
							if viewModel.isSigningIn {
								ProgressView()
									.tint(.white)
									.padding(.trailing, 4)
							}
							Text(viewModel.isSigningIn ? "Signing in…" : "Sign in with Centerpoint")
								.font(.headline)
						}
						.frame(maxWidth: .infinity)
						.padding(.vertical, 4)
					}
					.buttonStyle(.borderedProminent)
					.controlSize(.large)
					.disabled(viewModel.isSigningIn)

					if let error = viewModel.lastError {
						Text(error)
							.font(.footnote)
							.foregroundStyle(.red)
							.multilineTextAlignment(.center)
							.padding(.horizontal)
					}
				} else {
					VStack(spacing: 8) {
						Image(systemName: "exclamationmark.triangle.fill")
							.font(.title2)
							.foregroundStyle(.orange)

						Text("Configuration Error")
							.font(.headline)

						Text("Wardrobe OIDC client ID is missing. Please check your app configuration.")
							.font(.footnote)
							.foregroundStyle(.secondary)
							.multilineTextAlignment(.center)
					}
					.padding()
					.frame(maxWidth: .infinity)
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 12))
				}
			}
			.padding(.horizontal, 32)
			.padding(.bottom, 24)
		}
	}
}

// MARK: - Previews

#Preview("Configured") {
	SignInView()
		.environment(AppModel.preview().auth)
}

#Preview("Unconfigured") {
	let config = AppConfig(baseURL: URL(string: "https://wardrobe.vidur.xyz")!, issuer: URL(string: "https://z.vidur.xyz")!, clientID: "")
	let auth = AuthSession(config: config, signedInAs: AppModel.devClaims)
	return SignInView().environment(auth)
}
