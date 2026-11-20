import SwiftUI
import WardrobeKit
import WardrobeKitTesting

/// Account, uploads, cache, sign-out, version (WP8).
struct SettingsView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(AuthSession.self) private var auth

	@State private var viewModel: SettingsModel?

	var body: some View {
		Group {
			if let viewModel {
				SettingsContent(viewModel: viewModel)
			} else {
				ProgressView()
			}
		}
		.navigationTitle("Settings")
		.task {
			if viewModel == nil {
				viewModel = SettingsModel(uploads: appModel.uploads, images: appModel.images)
			}
		}
	}
}

// MARK: - Content

private struct SettingsContent: View {
	@Bindable var viewModel: SettingsModel
	@Environment(AppModel.self) private var appModel
	@Environment(AuthSession.self) private var auth

	var body: some View {
		List {
			accountSection
			ImmichSettingsSection()
			uploadsSection
			cacheSection
			webAppSection
			aboutSection
			signOutSection
		}
	}

	// MARK: - Account Section

	private var accountSection: some View {
		Section("Account") {
			HStack(spacing: 12) {
				Image(systemName: "person.circle.fill")
					.font(.system(size: 40))
					.foregroundStyle(.tint)

				VStack(alignment: .leading, spacing: 2) {
					HStack(spacing: 6) {
						Text(displayName)
							.font(.headline)

						if appModel.me?.isAdmin == true {
							Text("Admin")
								.font(.caption2.bold())
								.padding(.horizontal, 6)
								.padding(.vertical, 2)
								.background(Color.accentColor.opacity(0.15))
								.foregroundStyle(Color.accentColor)
								.clipShape(Capsule())
						}
					}

					if let email = appModel.me?.email ?? auth.claims?.email {
						Text(email)
							.font(.subheadline)
							.foregroundStyle(.secondary)
					}
				}
			}
			.padding(.vertical, 4)
		}
	}

	private var displayName: String {
		appModel.me?.displayName ?? auth.claims?.preferredUsername ?? auth.claims?.email ?? "Signed in"
	}

	// MARK: - Uploads Section

	private var uploadsSection: some View {
		Section("Uploads") {
			HStack {
				Label("Pending", systemImage: "arrow.clockwise.circle")
				Spacer()
				Text("\(viewModel.pendingCount)")
					.foregroundStyle(.secondary)
			}

			HStack {
				Label("Failed", systemImage: "exclamationmark.triangle")
				Spacer()
				Text("\(viewModel.failedCount)")
					.foregroundStyle(viewModel.failedCount > 0 ? .red : .secondary)
			}

			if !viewModel.failedJobs.isEmpty {
				ForEach(viewModel.failedJobs) { job in
					FailedJobRow(job: job, onRetry: {
						viewModel.retryJob(id: job.id)
					}, onDiscard: {
						viewModel.discardJob(id: job.id)
					})
				}
			}
		}
	}

	// MARK: - Cache Section

	private var cacheSection: some View {
		Section("Cache") {
			Button {
				Task { await viewModel.clearImageCache() }
			} label: {
				HStack {
					Label("Clear image cache", systemImage: "trash")
					Spacer()
					if viewModel.isClearingCache {
						ProgressView().controlSize(.small)
					} else if viewModel.cacheCleared {
						Image(systemName: "checkmark")
							.foregroundStyle(.green)
					}
				}
			}
			.disabled(viewModel.isClearingCache)
		}
	}

	// MARK: - Web App Section

	private var webAppSection: some View {
		Section("Web App") {
			Link(destination: appModel.config.baseURL) {
				HStack {
					Label("Open web app in Safari", systemImage: "safari")
					Spacer()
					Image(systemName: "arrow.up.right")
						.font(.footnote)
						.foregroundStyle(.secondary)
				}
			}
		}
	}

	// MARK: - About Section

	private var aboutSection: some View {
		Section("About") {
			HStack {
				Label("Version", systemImage: "info.circle")
				Spacer()
				Text(viewModel.versionString)
					.foregroundStyle(.secondary)
			}
		}
	}

	// MARK: - Sign Out Section

	private var signOutSection: some View {
		Section {
			Button(role: .destructive) {
				viewModel.showSignOutConfirmation = true
			} label: {
				HStack {
					Spacer()
					Text("Sign out")
					Spacer()
				}
			}
			.confirmationDialog(
				"Sign out of Wardrobe?",
				isPresented: $viewModel.showSignOutConfirmation,
				titleVisibility: .visible
			) {
				Button("Sign out", role: .destructive) {
					Task { await appModel.signOut() }
				}
				Button("Cancel", role: .cancel) {}
			} message: {
				Text("You will need to sign in again to access your wardrobe.")
			}
		}
	}
}

// MARK: - Failed Job Row

private struct FailedJobRow: View {
	let job: UploadJob
	let onRetry: () -> Void
	let onDiscard: () -> Void

	var body: some View {
		VStack(alignment: .leading, spacing: 6) {
			HStack {
				Text("Capture (\(job.kind.rawValue.capitalized))")
					.font(.subheadline.bold())
				Spacer()
				Text(job.createdAt, format: .dateTime.hour().minute().second())
					.font(.caption)
					.foregroundStyle(.secondary)
			}

			if let error = job.lastError {
				Text(error)
					.font(.caption)
					.foregroundStyle(.red)
			}

			HStack(spacing: 12) {
				Button {
					onRetry()
				} label: {
					Label("Retry", systemImage: "arrow.clockwise")
						.font(.caption)
				}
				.buttonStyle(.bordered)
				.accessibilityLabel("Retry upload")

				Button(role: .destructive) {
					onDiscard()
				} label: {
					Label("Discard", systemImage: "trash")
						.font(.caption)
				}
				.buttonStyle(.bordered)
				.accessibilityLabel("Discard upload")
			}
		}
		.padding(.vertical, 4)
	}
}

// MARK: - Previews

#Preview {
	NavigationStack {
		SettingsView()
	}
	.environment(AppModel.preview())
	.environment(AppModel.preview().auth)
	.environment(AppModel.preview().uploads)
}
