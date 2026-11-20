import SwiftUI
import WardrobeKit

/// Manages the current user's Immich connection.
@MainActor @Observable
final class ImmichSettingsModel {
	private let api: any WardrobeAPI
	var status: ImmichStatusDTO?
	var error: String?
	var key = ""
	weak var appModel: AppModel?

	init(api: any WardrobeAPI) { self.api = api }
	func load() async {
		do { status = try await api.immichStatus() } catch { self.error = appModel?.message(for: error) }
	}
	func connect() async {
		do {
			status = try await api.connectImmich(ConnectImmichRequest(apiKey: key))
			key = ""
		} catch {
			let message = appModel?.message(for: error)
			self.error = (error as? APIError)?.error == "immich_key_rejected" ? "Immich rejected this API key." : message
		}
	}
	func disconnect() async {
		do { try await api.disconnectImmich(); await load() } catch { self.error = appModel?.message(for: error) }
	}
}

/// Connection controls for Settings.
struct ImmichSettingsSection: View {
	@Environment(AppModel.self) private var appModel
	@State private var model: ImmichSettingsModel?
	@State private var confirming = false

	var body: some View {
		Section("Immich") {
			if let model {
				if let status = model.status {
					if !status.enabled {
						Text("Immich is not enabled on this server.")
					} else if status.connected {
						Text("Connected as \(status.user?.email ?? status.user?.name ?? "Immich user")")
						Button("Disconnect", role: .destructive) { confirming = true }
							.confirmationDialog("Disconnect Immich?", isPresented: $confirming, titleVisibility: .visible) {
								Button("Disconnect", role: .destructive) { Task { await model.disconnect() } }
							} message: { Text("Photos you linked from Immich will stop loading until you reconnect.") }
					} else {
						@Bindable var model = model
						SecureField("Immich API key", text: $model.key)
							.textInputAutocapitalization(.never).autocorrectionDisabled()
						Text("Create an API key in Immich account settings with user.read, asset.read and asset.view permissions.")
							.font(.footnote).foregroundStyle(.secondary)
						Button("Connect") { Task { await model.connect() } }.disabled(model.key.isEmpty)
					}
				} else { ProgressView() }
				if let error = model.error { Text(error).foregroundStyle(.red) }
			} else { ProgressView() }
		}
		.task {
			if model == nil {
				let value = ImmichSettingsModel(api: appModel.api)
				value.appModel = appModel
				model = value
				await value.load()
			}
		}
	}
}

#Preview {
	List { ImmichSettingsSection() }.environment(AppModel.preview())
}
