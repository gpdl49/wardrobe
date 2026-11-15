import SwiftUI
import WardrobeKit

struct CatalogueFilterSheet: View {
	@Environment(\.dismiss) private var dismiss
	@Bindable var model: CatalogueModel

	var body: some View {
		NavigationStack {
			Form {
				// Location section
				Section("Location") {
					Picker("Location", selection: $model.selectedLocationId) {
						Text("Anywhere").tag(nil as ID?)
						ForEach(model.locations) { loc in
							Label(loc.name, systemImage: loc.kind.symbolName)
								.tag(loc.id as ID?)
						}
					}
				}

				// Category section
				Section("Category") {
					Picker("Category", selection: $model.selectedCategoryId) {
						Text("All categories").tag(nil as ID?)
						let tree = CategoryTree.buildTree(from: model.categories)
						ForEach(CategoryTree.flatten(nodes: tree)) { node in
							Text(indentString(depth: node.depth) + node.name)
								.tag(node.id as ID?)
						}
					}
				}

				// Tag section
				Section("Tag") {
					Picker("Tag", selection: $model.selectedTag) {
						Text("Any tag").tag(nil as String?)
						ForEach(model.tags, id: \.name) { tag in
							Text("#\(tag.name) (\(tag.count))").tag(tag.name as String?)
						}
					}
				}

				// Season section
				Section("Season") {
					ScrollView(.horizontal, showsIndicators: false) {
						HStack(spacing: 8) {
							seasonPill(nil, title: "All")
							ForEach(Season.known, id: \.rawValue) { season in
								seasonPill(season, title: season.label)
							}
						}
						.padding(.vertical, 4)
					}
				}

				// Colour section
				Section("Colour") {
					colorSwatchesGrid
				}

				// Status section
				Section("Status") {
					ScrollView(.horizontal, showsIndicators: false) {
						HStack(spacing: 8) {
							statusPill(nil, title: "All")
							ForEach(ItemStatus.known, id: \.rawValue) { status in
								statusPill(status, title: status.label)
							}
						}
						.padding(.vertical, 4)
					}
				}
			}
			.navigationTitle("Filters")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Reset") {
						Task {
							await model.clearFilters()
						}
					}
					.disabled(model.activeFilterCount == 0)
				}
				ToolbarItem(placement: .confirmationAction) {
					Button("Done") {
						dismiss()
					}
				}
			}
		}
	}

	private func indentString(depth: Int) -> String {
		String(repeating: "   ", count: depth)
	}

	@ViewBuilder
	private func seasonPill(_ season: Season?, title: String) -> some View {
		let isSelected = model.selectedSeason == season
		Button {
			model.selectedSeason = season
			Task { await model.reload() }
		} label: {
			HStack(spacing: 4) {
				if let season {
					Image(systemName: season.symbolName)
				}
				Text(title)
			}
			.font(.subheadline)
			.padding(.horizontal, 12)
			.padding(.vertical, 6)
			.background(isSelected ? Color.accentColor : Color(.secondarySystemFill))
			.foregroundStyle(isSelected ? Color.white : Color.primary)
			.clipShape(Capsule())
		}
		.buttonStyle(.plain)
	}

	@ViewBuilder
	private func statusPill(_ status: ItemStatus?, title: String) -> some View {
		let isSelected = model.selectedStatus == status
		Button {
			model.selectedStatus = status
			Task { await model.reload() }
		} label: {
			Text(title)
				.font(.subheadline)
				.padding(.horizontal, 12)
				.padding(.vertical, 6)
				.background(isSelected ? Color.accentColor : Color(.secondarySystemFill))
				.foregroundStyle(isSelected ? Color.white : Color.primary)
				.clipShape(Capsule())
		}
		.buttonStyle(.plain)
	}

	private var colorSwatchesGrid: some View {
		LazyVGrid(columns: [GridItem(.adaptive(minimum: 36), spacing: 10)], spacing: 10) {
			ForEach(Palette.colors) { swatch in
				let isSelected = model.selectedColor == swatch.name
				Button {
					if isSelected {
						model.selectedColor = nil
					} else {
						model.selectedColor = swatch.name
					}
					Task { await model.reload() }
				} label: {
					ZStack {
						Circle()
							.fill(Color(hex: swatch.hex))
							.frame(width: 36, height: 36)
							.overlay {
								if swatch.isLight {
									Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1)
								}
							}

						if isSelected {
							Image(systemName: "checkmark")
								.font(.caption.bold())
								.foregroundStyle(swatch.isLight ? .black : .white)
						}
					}
				}
				.buttonStyle(.plain)
				.accessibilityLabel("\(swatch.name)\(isSelected ? ", selected" : "")")
			}
		}
		.padding(.vertical, 6)
	}
}
