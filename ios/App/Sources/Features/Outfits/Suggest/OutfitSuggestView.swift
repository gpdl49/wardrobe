import SwiftUI
import WardrobeKit

/// Request and review outfit suggestions for the current wardrobe.
struct OutfitSuggestView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(Router.self) private var router
	@Environment(\.horizontalSizeClass) private var sizeClass
	@State private var model: OutfitSuggestModel?
	@State private var showPicker = false

	var body: some View {
		Group {
			if let model { content(model) } else { ProgressView("Loading suggestions…") }
		}
		.navigationTitle("Suggest outfits")
		.task(id: appModel.scope?.id) {
			let current = OutfitSuggestModel(api: appModel.api, ownerId: appModel.scope?.ownerId)
			current.appModel = appModel
			model = current
			await current.load()
			await current.poll()
		}
	}

	private var canEdit: Bool { appModel.scope?.access.canEdit ?? false }

	private func content(_ model: OutfitSuggestModel) -> some View {
		@Bindable var model = model
		return List {
			if appModel.me?.features?.suggestions == false {
				Section { Label("Outfit suggestions are switched off.", systemImage: "sparkles") }
			}
			if canEdit && appModel.me?.features?.suggestions != false {
				Section("Create suggestions") {
					TextField("Describe an occasion or style", text: $model.prompt, axis: .vertical)
						.lineLimit(2...5)
					Text("\(model.prompt.count)/500").font(.caption).foregroundStyle(.secondary)
					ScrollView(.horizontal, showsIndicators: false) {
						HStack {
							ForEach(["A relaxed weekend", "Dinner out", "Office layers"], id: \.self) { example in
								Button(example) { model.prompt = example }.buttonStyle(.bordered).controlSize(.small)
							}
						}
					}
					Picker("Season", selection: $model.season) {
						Text("Any season").tag(nil as Season?)
						ForEach(Season.known, id: \.rawValue) { Text($0.label).tag($0 as Season?) }
					}
					Button("Must include: \(model.selectedItems.count) of 5") { showPicker = true }
					Stepper("Outfits: \(model.count)", value: $model.count, in: 1...6)
					Button("Suggest outfits", systemImage: "sparkles") { Task { await model.submit() } }
						.disabled(model.busy || model.prompt.count > 500)
						.keyboardShortcut(.defaultAction)
				}
			}
			if canEdit {
				Section("Bulk tagging") {
					Button("Queue tag suggestions") { Task { await model.bulk(queue: true) } }
					Button("Apply suggested tags") { Task { await model.bulk(queue: false) } }
					if let message = model.bulkMessage { Text(message).foregroundStyle(.secondary) }
				}
				.disabled(model.busy)
			}
			Section("Past runs") {
				if model.runs.isEmpty { Text("No suggestions yet.").foregroundStyle(.secondary) }
				ForEach(model.runs) { run in runView(run, model: model) }
			}
		}
		.refreshable { await model.load() }
		.errorAlert($model.errorMessage)
		.sheet(isPresented: $showPicker) { itemPicker(model) }
		.alert("Outfit saved", isPresented: Binding(
			get: { model.savedOutfitId != nil }, set: { if !$0 { model.savedOutfitId = nil } }
		)) {
			Button("Open outfit") {
				if let id = model.savedOutfitId { router.open(.outfit(id)) }
				model.savedOutfitId = nil
			}
			Button("Stay here", role: .cancel) { model.savedOutfitId = nil }
		}
	}

	private func runView(_ run: SuggestionRunDTO, model: OutfitSuggestModel) -> some View {
		VStack(alignment: .leading, spacing: 12) {
			Text(run.request.prompt ?? "Outfit ideas").font(.headline)
			Text(run.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
			if run.status == .queued || run.status == .running {
				ProgressView("Finding outfits… This can take a few seconds.")
			} else if run.status == .failed {
				Label(run.error ?? "This run failed.", systemImage: "exclamationmark.triangle")
					.foregroundStyle(.red)
			} else if run.status != .done {
				Text(run.status.rawValue.capitalized).foregroundStyle(.secondary)
			}
			ForEach(run.suggestions) { suggestion in
				VStack(alignment: .leading, spacing: 8) {
					Text(suggestion.name).font(.headline)
					if let rationale = suggestion.rationale { Text(rationale).font(.subheadline) }
					LazyVGrid(columns: [GridItem(.adaptive(minimum: sizeClass == .regular ? 150 : 110))]) {
						ForEach(suggestion.items) { item in
							NavigationLink(value: Route.item(item.id)) { CatalogueGridTile(item: item) }
								.buttonStyle(.plain)
						}
					}
					if suggestion.feedback == .saved {
						if let id = suggestion.outfitId { NavigationLink("Saved · Open outfit", value: Route.outfit(id)) }
						else { Label("Saved", systemImage: "checkmark") }
					} else if suggestion.feedback == .dismissed {
						Label("Dismissed", systemImage: "xmark")
					} else if suggestion.feedback == nil && canEdit {
						HStack {
							Button("Save") { Task { await model.save(suggestion) } }.buttonStyle(.borderedProminent)
							Button("Dismiss") { Task { await model.dismiss(suggestion) } }.buttonStyle(.bordered)
						}.disabled(model.actionId != nil)
					}
				}
				.padding(.vertical, 8)
			}
		}.padding(.vertical, 6)
	}

	private func itemPicker(_ model: OutfitSuggestModel) -> some View {
		NavigationStack {
			List(model.items) { item in
				Button {
					if model.selectedItems.contains(item.id) { model.selectedItems.remove(item.id) }
					else if model.selectedItems.count < 5 { model.selectedItems.insert(item.id) }
				} label: {
					HStack {
						CatalogueListRow(item: item)
						if model.selectedItems.contains(item.id) { Image(systemName: "checkmark") }
					}
				}.disabled(!model.selectedItems.contains(item.id) && model.selectedItems.count >= 5)
			}
			.navigationTitle("Must include")
			.toolbar { Button("Done") { showPicker = false } }
		}
	}
}

#Preview {
	NavigationStack { OutfitSuggestView() }
		.environment(AppModel.preview())
		.environment(Router())
}
