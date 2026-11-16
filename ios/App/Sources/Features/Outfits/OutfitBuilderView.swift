import SwiftUI
import WardrobeKit

/// Create or edit an outfit and its ordered items.
struct OutfitBuilderView: View {
	let ownerId: ID?
	let outfit: OutfitDetailDTO?
	let onSave: (OutfitDetailDTO) -> Void
	@Environment(AppModel.self) private var app
	@Environment(\.dismiss) private var dismiss
	@State private var model: OutfitBuilderModel?
	@State private var picking = false

	var body: some View {
		NavigationStack {
			Group {
				if let model { form(model) } else { ProgressView() }
			}
			.navigationTitle(outfit == nil ? "New outfit" : "Edit outfit")
			.toolbar {
				ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
				ToolbarItem(placement: .confirmationAction) {
					Button("Save") { Task { if let result = await model?.save() { onSave(result) } } }
						.disabled(!(model?.valid ?? false) || (model?.saving ?? false))
						.keyboardShortcut(.defaultAction)
				}
			}
			.task {
				if model == nil {
					let vm = OutfitBuilderModel(api: app.api, ownerId: ownerId, outfit: outfit)
					vm.appModel = app; model = vm; await vm.loadItems()
				}
			}
		}
	}
	private func form(_ model: OutfitBuilderModel) -> some View {
		@Bindable var model = model
		return Form {
			Section("Details") {
				TextField("Name", text: $model.name)
				TextField("Notes", text: $model.notes, axis: .vertical)
				TextField("Tags, separated by commas", text: $model.tags)
			}
			Section("Seasons") {
				ForEach(Season.known, id: \.rawValue) { season in
					Toggle(season.label, isOn: Binding(
						get: { model.seasons.contains(season) },
						set: { selected in
							if selected { model.seasons.append(season) }
							else { model.seasons.removeAll { $0 == season } }
						}))
				}
			}
			Section("Items (\(model.selected.count)/50)") {
				ForEach(model.selected) { item in Text(item.name ?? "Untitled item").opacity(item.nameGenerated == true ? 0.6 : 1) }
					.onDelete { model.selected.remove(atOffsets: $0) }
					.onMove { model.selected.move(fromOffsets: $0, toOffset: $1) }
				Button("Choose items") { picking = true }
			}
		}
		.environment(\.editMode, .constant(.active))
		.sheet(isPresented: $picking) { OutfitItemPicker(model: model) }
		.errorAlert($model.errorMessage)
	}
}

private struct OutfitItemPicker: View {
	@Bindable var model: OutfitBuilderModel
	@Environment(\.dismiss) private var dismiss
	@State private var search = ""
	var body: some View {
		NavigationStack {
			List {
				ForEach(model.available.filter { search.isEmpty || ($0.name ?? "").localizedCaseInsensitiveContains(search) }) { item in
					let selected = model.selected.contains { $0.id == item.id }
					Button { model.toggle(item) } label: {
						HStack {
							Text(item.name ?? "Untitled item").opacity(item.nameGenerated == true ? 0.6 : 1)
							Spacer()
							if selected { Image(systemName: "checkmark").accessibilityLabel("Selected") }
						}
					}
					.disabled(!selected && model.selected.count >= 50)
				}
			}
			.searchable(text: $search)
			.navigationTitle("Choose items")
			.toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
		}
	}
}

#Preview {
	OutfitBuilderView(ownerId: nil, outfit: nil) { _ in }.environment(AppModel.preview())
}
