import SwiftUI
import WardrobeKit

@MainActor
@Observable
final class ItemEditModel {
	let item: ItemDetailDTO
	let api: any WardrobeAPI

	var initial: ItemFormData
	var form: ItemFormData

	var locations: [LocationDTO] = []
	var categories: [CategoryDTO] = []
	var tagSuggestions: [TagCountDTO] = []

	var isLoadingData: Bool = false
	var isSaving: Bool = false
	var errorMessage: String? = nil

	init(item: ItemDetailDTO, api: any WardrobeAPI) {
		self.item = item
		self.api = api
		let data = ItemFormData(item: item)
		self.initial = data
		self.form = data
	}

	var hasChanges: Bool {
		ItemDiff.hasChanges(initial: initial, edited: form)
	}

	func loadAuxiliaryData() async {
		isLoadingData = true
		defer { isLoadingData = false }
		async let locs = try? api.locations(LocationQuery(owner: item.ownerId))
		async let cats = try? api.categories()
		async let tags = try? api.tags(owner: item.ownerId)

		let (l, c, t) = await (locs, cats, tags)
		self.locations = l ?? []
		self.categories = c ?? []
		self.tagSuggestions = t ?? []
	}

	func save() async -> ItemDetailDTO? {
		guard hasChanges else { return item }
		isSaving = true
		errorMessage = nil
		defer { isSaving = false }

		let patch = ItemDiff.diff(initial: initial, edited: form)
		do {
			_ = try await api.updateItem(id: item.id, patch)
			// Return refreshed item detail
			return try await api.item(id: item.id)
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
			return nil
		}
	}
}

/// Sheet to edit an existing item.
struct ItemEditView: View {
	@Environment(\.dismiss) private var dismiss
	@State private var model: ItemEditModel
	var onSave: (ItemDetailDTO) -> Void

	init(item: ItemDetailDTO, api: any WardrobeAPI, onSave: @escaping (ItemDetailDTO) -> Void) {
		_model = State(initialValue: ItemEditModel(item: item, api: api))
		self.onSave = onSave
	}

	var body: some View {
		NavigationStack {
			Form {
				Section("General") {
					TextField("Name", text: $model.form.name)

					CategoryPickerView(selection: $model.form.categoryId, categories: model.categories)

					Picker("Location", selection: $model.form.locationId) {
						Text("No location").tag(ID?.none)
						ForEach(model.locations) { loc in
							Label(loc.name.isEmpty ? loc.code : "\(loc.code) — \(loc.name)", systemImage: loc.kind.symbolName)
								.tag(ID?.some(loc.id))
						}
					}

					Picker("Status", selection: $model.form.status) {
						ForEach(ItemStatus.known, id: \.rawValue) { status in
							Text(status.label).tag(status)
						}
					}
				}

				Section("Details") {
					TextField("Brand", text: $model.form.brand)
					TextField("Size", text: $model.form.size)
					TextField("Pattern", text: $model.form.pattern)
					TextField("Material", text: $model.form.material)
				}

				Section("Seasons") {
					HStack(spacing: 8) {
						ForEach(Season.known, id: \.rawValue) { season in
							let isSelected = model.form.seasons.contains(season)
							Button {
								if isSelected {
									model.form.seasons.removeAll { $0 == season }
								} else {
									model.form.seasons.append(season)
								}
							} label: {
								VStack(spacing: 4) {
									Image(systemName: season.symbolName)
										.font(.title3)
									Text(season.label)
										.font(.caption2)
								}
								.frame(maxWidth: .infinity)
								.padding(.vertical, 8)
								.background(isSelected ? Color.accentColor.opacity(0.18) : Color.clear)
								.overlay(
									RoundedRectangle(cornerRadius: 8)
										.stroke(isSelected ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: 1)
								)
								.clipShape(RoundedRectangle(cornerRadius: 8))
							}
							.buttonStyle(.plain)
							.accessibilityLabel("\(season.label), \(isSelected ? "selected" : "not selected")")
						}
					}
				}

				Section("Colours") {
					ColorEditorView(colors: $model.form.colors)
				}

				Section("Tags") {
					TagEditorView(tags: $model.form.tags, suggestions: model.tagSuggestions)
				}

				Section("Notes") {
					TextField("Notes", text: $model.form.notes, axis: .vertical)
						.lineLimit(3...8)
				}
			}
			.navigationTitle("Edit item")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") { dismiss() }
				}
				ToolbarItem(placement: .confirmationAction) {
					Button("Save") {
						Task {
							if let updated = await model.save() {
								onSave(updated)
								dismiss()
							}
						}
					}
					.disabled(!model.hasChanges || model.isSaving)
				}
			}
			.task {
				await model.loadAuxiliaryData()
			}
			.errorAlert($model.errorMessage)
		}
	}
}
