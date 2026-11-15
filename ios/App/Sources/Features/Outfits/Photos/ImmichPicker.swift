import SwiftUI
import WardrobeKit

/// Searchable, paginated selection from the user's Immich library.
@MainActor @Observable
final class ImmichPickerModel {
	let api: any WardrobeAPI
	var status: ImmichStatusDTO?
	var assets: [ImmichAssetDTO] = []
	var selected: Set<ID> = []
	var cursor: String?
	var query = ""
	var error: String?
	var loading = false
	weak var appModel: AppModel?
	init(api: any WardrobeAPI) { self.api = api }
	func loadStatus() async {
		do { status = try await api.immichStatus(); if status?.connected == true { await search() } }
		catch { self.error = appModel?.message(for: error) }
	}
	func search() async { assets = []; cursor = nil; await page() }
	func page() async {
		guard !loading else { return }
		loading = true
		defer { loading = false }
		do {
			let result = try await api.immichAssets(ImmichAssetQuery(q: query.isEmpty ? nil : query, cursor: cursor))
			assets.append(contentsOf: result.assets); cursor = result.nextCursor
		} catch { self.error = appModel?.message(for: error) }
	}
	func link(outfitId: ID) async -> [OutfitPhotoDTO]? {
		do { return try await api.linkImmichAssets(outfitId: outfitId, LinkImmichAssetsRequest(assetIds: Array(selected))) }
		catch { self.error = appModel?.message(for: error); return nil }
	}
}

/// Immich library selection sheet.
struct ImmichPicker: View {
	let outfitId: ID
	let onLink: ([OutfitPhotoDTO]) -> Void
	@Environment(AppModel.self) private var appModel
	@Environment(\.dismiss) private var dismiss
	@State private var model: ImmichPickerModel?
	var body: some View {
		NavigationStack {
			Group {
				if let model {
					if model.status?.connected == false {
						ContentUnavailableView("Connect Immich", systemImage: "photo", description: Text("Connect your Immich account in Settings to select photos."))
					} else {
						@Bindable var model = model
						ScrollView {
							LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))]) {
								ForEach(model.assets) { asset in
									Button {
										if model.selected.contains(asset.id) { model.selected.remove(asset.id) }
										else if model.selected.count < 50 { model.selected.insert(asset.id) }
									} label: {
										ImmichThumbnail(assetId: asset.id).frame(height: 120).clipped()
											.overlay(alignment: .topTrailing) { if model.selected.contains(asset.id) { Image(systemName: "checkmark.circle.fill").padding(6) } }
									}.accessibilityLabel(asset.fileName ?? "Immich photo")
								}
							}
							if model.cursor != nil { Button("Load more") { Task { await model.page() } } }
							if model.loading { ProgressView() }
							if let error = model.error { Text(error).foregroundStyle(.red) }
						}.searchable(text: $model.query).onSubmit(of: .search) { Task { await model.search() } }
					}
				} else { ProgressView() }
			}
			.navigationTitle("Immich")
			.toolbar {
				ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
				ToolbarItem(placement: .confirmationAction) {
					Button("Link") { Task { if let photos = await model?.link(outfitId: outfitId) { onLink(photos); dismiss() } } }
						.disabled(model?.selected.isEmpty != false)
				}
			}
		}
		.task {
			if model == nil { let value = ImmichPickerModel(api: appModel.api); value.appModel = appModel; model = value; await value.loadStatus() }
		}
	}
}

private struct ImmichThumbnail: View {
	let assetId: ID
	@Environment(AppModel.self) private var appModel
	@State private var image: UIImage?
	var body: some View {
		ZStack {
			Rectangle().fill(.quaternary)
			if let image { Image(uiImage: image).resizable().scaledToFill() }
			else { Image(systemName: "photo") }
		}.task(id: assetId) {
			if let data = try? await appModel.images.immichThumbnail(assetId: assetId) { image = UIImage(data: data) }
		}
	}
}
