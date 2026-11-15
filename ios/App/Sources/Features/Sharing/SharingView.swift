import SwiftUI
import WardrobeKit
import WardrobeKitTesting

/// Shares I own and wardrobes shared with me (WP8).
struct SharingView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(Router.self) private var router

	@State private var viewModel: SharingModel?

	var body: some View {
		Group {
			if let viewModel {
				SharingContent(viewModel: viewModel)
			} else {
				ProgressView()
			}
		}
		.navigationTitle("Sharing")
		.task {
			if viewModel == nil {
				let vm = SharingModel(api: appModel.api)
				viewModel = vm
				await vm.load(appModel: appModel)
			}
		}
	}
}

// MARK: - Content

private struct SharingContent: View {
	@Bindable var viewModel: SharingModel
	@Environment(AppModel.self) private var appModel
	@Environment(Router.self) private var router

	var body: some View {
		List {
			sharedByMeSection
			sharedWithMeSection
		}
		.refreshable {
			await viewModel.load(appModel: appModel)
		}
		.errorAlert($viewModel.errorMessage)
		.confirmationDialog(
			"Stop sharing with \(viewModel.shareToRevoke?.grantee.displayName ?? "this user")?",
			isPresented: $viewModel.showRevokeConfirmation,
			titleVisibility: .visible
		) {
			Button("Stop sharing", role: .destructive) {
				Task { await viewModel.confirmRevoke(appModel: appModel) }
			}
			Button("Cancel", role: .cancel) {
				viewModel.shareToRevoke = nil
			}
		} message: {
			if let share = viewModel.shareToRevoke {
				let who = share.grantee.displayName
				let scopeDesc = share.location.map { "\($0.code) · \($0.name)" } ?? "your whole wardrobe"
				Text("\(who) loses access to \(scopeDesc). Photo links they already opened keep working for up to 10 minutes.")
			}
		}
	}

	// MARK: - "Shared by me" Section

	private var sharedByMeSection: some View {
		Section("Shared by me") {
			addShareForm

			if viewModel.shares.isEmpty {
				Text("Not shared with anyone yet")
					.foregroundStyle(.secondary)
					.font(.subheadline)
			} else {
				ForEach(viewModel.shares) { share in
					ShareRow(share: share) { newAccess in
						Task { await viewModel.updateShare(share: share, newAccess: newAccess, appModel: appModel) }
					}
					.swipeActions(edge: .trailing, allowsFullSwipe: false) {
						Button(role: .destructive) {
							viewModel.requestRevoke(share: share)
						} label: {
							Label("Revoke", systemImage: "trash")
						}
					}
				}
			}
		}
	}

	// MARK: - Add Share Form

	private var addShareForm: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Share with someone")
				.font(.subheadline.bold())

			TextField("Email or username", text: $viewModel.grantee)
				.textFieldStyle(.roundedBorder)
				.autocorrectionDisabled()
				.textInputAutocapitalization(.never)
				.keyboardType(.emailAddress)

			HStack(spacing: 12) {
				Picker("Scope", selection: $viewModel.selectedLocationId) {
					Text("Whole wardrobe").tag(nil as ID?)
					ForEach(viewModel.locations) { loc in
						Text("\(loc.code) · \(loc.name)").tag(loc.id as ID?)
					}
				}
				.pickerStyle(.menu)

				Spacer()

				Picker("Access", selection: $viewModel.access) {
					Text("Can view").tag(ShareAccess.view)
					Text("Can edit").tag(ShareAccess.edit)
				}
				.pickerStyle(.menu)
			}

			if let formError = viewModel.formError {
				Label(formError, systemImage: "exclamationmark.circle")
					.font(.caption)
					.foregroundStyle(.red)
			}

			Button {
				Task { await viewModel.createShare(appModel: appModel) }
			} label: {
				HStack {
					if viewModel.isSubmitting {
						ProgressView().controlSize(.small)
					}
					Text(viewModel.isSubmitting ? "Sharing…" : "Share")
				}
			}
			.buttonStyle(.borderedProminent)
			.disabled(viewModel.isSubmitting || viewModel.grantee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
		}
		.padding(.vertical, 4)
	}

	// MARK: - "Shared with me" Section

	private var sharedWithMeSection: some View {
		Section("Shared with me") {
			if viewModel.sharedWithMe.isEmpty {
				Text("Nothing shared with you yet")
					.foregroundStyle(.secondary)
					.font(.subheadline)
			} else {
				ForEach(viewModel.sharedWithMe) { share in
					Button {
						viewModel.selectSharedWithMe(share, appModel: appModel, router: router)
					} label: {
						HStack {
							VStack(alignment: .leading, spacing: 4) {
								Text(share.owner.displayName)
									.font(.headline)
									.foregroundStyle(.primary)
								Text(share.location.map { "\($0.code) · \($0.name)" } ?? "Whole wardrobe")
									.font(.subheadline)
									.foregroundStyle(.secondary)
							}
							Spacer()
							Text(share.access == .edit ? "Can edit" : "Can view")
								.font(.subheadline)
								.foregroundStyle(.secondary)
							Image(systemName: "chevron.right")
								.font(.caption.bold())
								.foregroundStyle(.tertiary)
						}
					}
					.accessibilityLabel("Shared wardrobe by \(share.owner.displayName), \(share.location.map { "\($0.code) · \($0.name)" } ?? "Whole wardrobe")")
				}
			}
		}
	}
}

// MARK: - Share Row

private struct ShareRow: View {
	let share: ShareDTO
	let onAccessChange: (ShareAccess) -> Void

	var body: some View {
		HStack {
			VStack(alignment: .leading, spacing: 4) {
				Text(share.grantee.displayName)
					.font(.headline)
				Text(share.location.map { "\($0.code) · \($0.name)" } ?? "Whole wardrobe")
					.font(.subheadline)
					.foregroundStyle(.secondary)
			}

			Spacer()

			Picker("Access for \(share.grantee.displayName)", selection: Binding(
				get: { share.access },
				set: { onAccessChange($0) }
			)) {
				Text("Can view").tag(ShareAccess.view)
				Text("Can edit").tag(ShareAccess.edit)
			}
			.pickerStyle(.menu)
		}
	}
}

// MARK: - Previews

#Preview {
	NavigationStack {
		SharingView()
	}
	.environment(AppModel.preview())
	.environment(Router())
}
