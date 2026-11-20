import SwiftUI
import WardrobeKit

/// The selected wardrobe's outfits and outfits shared directly with the viewer.
struct OutfitsView: View {
	@Environment(AppModel.self) private var app
	@Environment(Router.self) private var router
	@State private var model: OutfitsModel?
	@State private var creating = false

	var body: some View {
		Group {
			if let model { content(model) } else { ProgressView() }
		}
		.navigationTitle("Outfits")
		.toolbar {
			ToolbarItem(placement: .topBarLeading) { WardrobeSwitcher() }
			ToolbarItemGroup(placement: .primaryAction) {
				if (app.scope?.access.canEdit ?? false) && app.scope?.location == nil {
					NavigationLink(value: Route.suggest) { Label("Suggest", systemImage: "sparkles") }
						.accessibilityLabel("Suggest outfits")
					Button { creating = true } label: { Label("New outfit", systemImage: "plus") }
						.keyboardShortcut("n", modifiers: .command)
				}
			}
		}
		.task(id: app.scope?.id) {
			let vm = model ?? OutfitsModel(api: app.api)
			vm.appModel = app; model = vm
			await vm.load(ownerId: app.scope?.ownerId)
		}
		.onAppear {
			if let model { Task { await model.load(ownerId: app.scope?.ownerId) } }
		}
		.sheet(isPresented: $creating, onDismiss: { Task { await model?.load(ownerId: app.scope?.ownerId) } }) {
			OutfitBuilderView(ownerId: app.scope?.ownerId, outfit: nil) { outfit in
				creating = false
				router.open(.outfit(outfit.id))
			}
		}
	}

	private func content(_ model: OutfitsModel) -> some View {
		@Bindable var model = model
		return List {
			Section {
				TextField("Filter by tag", text: $model.tag)
				Picker("Season", selection: $model.season) {
					Text("All seasons").tag(nil as Season?)
					ForEach(Season.known, id: \.rawValue) { Text($0.label).tag($0 as Season?) }
				}
			} header: { Text("Filters") }
			Section("Outfits") {
				if model.outfits.isEmpty && !model.loading { Text("No outfits found").foregroundStyle(.secondary) }
				ForEach(model.outfits) { outfit in
					NavigationLink(value: Route.outfit(outfit.id)) { OutfitRow(outfit: outfit) }
						.onAppear { if outfit.id == model.outfits.last?.id { Task { await model.loadMore() } } }
				}
				if model.loading { ProgressView() }
			}
			Section("Shared with me") {
				if model.shared.isEmpty { Text("No outfits shared with you").foregroundStyle(.secondary) }
				ForEach(model.shared) { outfit in
					NavigationLink(value: Route.outfit(outfit.id)) { OutfitRow(outfit: outfit) }
				}
			}
		}
		.searchable(text: $model.search, prompt: "Search outfits")
		.task(id: model.query) {
			try? await Task.sleep(for: .milliseconds(300))
			if !Task.isCancelled { await model.load(ownerId: app.scope?.ownerId) }
		}
		.refreshable { await model.load(ownerId: app.scope?.ownerId) }
		.errorAlert($model.errorMessage)
	}
}

private struct OutfitRow: View {
	let outfit: OutfitSummaryDTO
	var body: some View {
		HStack {
			Image(systemName: "square.stack.3d.up").font(.title2).frame(width: 42)
			VStack(alignment: .leading) {
				Text(outfit.name)
				Text("\(outfit.itemCount) items" + (outfit.tags.isEmpty ? "" : " · " + outfit.tags.joined(separator: ", ")))
					.font(.caption).foregroundStyle(.secondary)
			}
		}
	}
}

/// Detail of a saved outfit, with controls determined by its access.
struct OutfitDetailView: View {
	let outfitId: ID
	@Environment(AppModel.self) private var app
	@Environment(\.dismiss) private var dismiss
	@Environment(\.horizontalSizeClass) private var sizeClass
	@State private var model: OutfitDetailModel?
	@State private var editing = false
	@State private var deleting = false
	@State private var grantee = ""
	@State private var revoke: OutfitShareDTO?

	var body: some View {
		Group {
			if let model, let outfit = model.outfit { detail(outfit, model: model) }
			else if model?.errorMessage != nil { ContentUnavailableView("Outfit unavailable", systemImage: "tshirt") }
			else { ProgressView() }
		}
		.task {
			if model == nil {
				let vm = OutfitDetailModel(api: app.api, outfitId: outfitId)
				vm.appModel = app; model = vm; await vm.load()
			}
		}
	}

	private func detail(_ outfit: OutfitDetailDTO, model: OutfitDetailModel) -> some View {
		@Bindable var model = model
		return Group {
			if sizeClass == .regular {
				HStack(alignment: .top) { photos(outfit); fields(outfit, model: model) }
			} else {
				List { photos(outfit); fieldsContent(outfit, model: model) }
			}
		}
		.navigationTitle(outfit.name)
		.toolbar {
			if outfit.access.canEdit {
				ToolbarItemGroup(placement: .primaryAction) {
					Button("Edit") { editing = true }.keyboardShortcut("e", modifiers: .command)
					Button("Delete", role: .destructive) { deleting = true }
						.confirmationDialog("Delete \(outfit.name)?", isPresented: $deleting, titleVisibility: .visible) {
							Button("Delete", role: .destructive) { Task { if await model.delete() { dismiss() } } }
						}
				}
			}
		}
		.sheet(isPresented: $editing) {
			OutfitBuilderView(ownerId: outfit.ownerId, outfit: outfit) { updated in
				model.outfit = updated; editing = false
			}
		}
		.errorAlert($model.errorMessage)
	}
	private func photos(_ outfit: OutfitDetailDTO) -> some View { OutfitPhotosSection(outfit: outfit) }
	private func fields(_ outfit: OutfitDetailDTO, model: OutfitDetailModel) -> some View {
		List { fieldsContent(outfit, model: model) }
	}
	@ViewBuilder private func fieldsContent(_ outfit: OutfitDetailDTO, model: OutfitDetailModel) -> some View {
		Section("Details") {
			if let notes = outfit.notes, !notes.isEmpty { Text(notes) }
			if !outfit.seasons.isEmpty { LabeledContent("Seasons", value: outfit.seasons.map(\.label).joined(separator: ", ")) }
			if !outfit.tags.isEmpty { LabeledContent("Tags", value: outfit.tags.joined(separator: ", ")) }
		}
		Section("Items") {
			if outfit.items.isEmpty { Text("No items").foregroundStyle(.secondary) }
			ForEach(outfit.items) { item in
				if OutfitDetailModel.canOpen(item, in: outfit) {
					NavigationLink(value: Route.item(item.id)) { itemRow(item) }
				} else { itemRow(item) }
			}
		}
		if outfit.access == .owner {
			Section("Shared with") {
				ForEach(outfit.shares) { share in
					Text(share.grantee.displayName).swipeActions {
						Button("Revoke", role: .destructive) { revoke = share }
					}
					.confirmationDialog(
						"Stop sharing?",
						isPresented: Binding(get: { revoke?.id == share.id }, set: { if !$0 { revoke = nil } })
					) {
						Button("Stop sharing", role: .destructive) {
							Task { await model.revoke(share) }; revoke = nil
						}
					}
				}
				TextField("Email or username", text: $grantee).textInputAutocapitalization(.never).autocorrectionDisabled()
				Button("Share") { Task { if await model.share(grantee) { grantee = "" } } }
					.disabled(grantee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
			}
		}
	}
	private func itemRow(_ item: ItemSummaryDTO) -> some View {
		HStack {
			RemotePhotoView(photo: item.coverPhoto, variant: .thumb).frame(width: 48, height: 48).clipped()
			Text(item.name ?? "Untitled item").opacity(item.nameGenerated == true ? 0.6 : 1)
		}
	}
}

#Preview {
	NavigationStack { OutfitsView() }.environment(AppModel.preview()).environment(Router())
}
