import SwiftUI
import WardrobeKit

/// A horizontally scrolling row of category chips supporting hierarchy drill-down.
///
/// Tapping a top-level category with subcategories drills into that category and
/// displays a back button alongside the child chips. Tapping an already-selected
/// chip deselects it.
struct CategoryChipsView: View {
	let categories: [CategoryDTO]
	@Binding var selection: ID?

	@State private var currentParentId: ID?

	init(categories: [CategoryDTO], selection: Binding<ID?>) {
		self.categories = categories
		self._selection = selection
		self._currentParentId = State(initialValue: nil)
	}

	private var categoriesById: [ID: CategoryDTO] {
		Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })
	}

	private func hasChildren(_ id: ID) -> Bool {
		categories.contains { $0.parentId == id }
	}

	private var shownCategories: [CategoryDTO] {
		categories
			.filter { $0.parentId == currentParentId }
			.sorted {
				if $0.sortOrder != $1.sortOrder {
					return $0.sortOrder < $1.sortOrder
				}
				return $0.name.localizedStandardCompare($1.name) == .orderedAscending
			}
	}

	private var currentParent: CategoryDTO? {
		guard let currentParentId else { return nil }
		return categoriesById[currentParentId]
	}

	var body: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 8) {
				if let parent = currentParent {
					Button {
						currentParentId = parent.parentId
					} label: {
						Label(parent.name, systemImage: "chevron.left")
							.font(.subheadline.weight(.medium))
							.padding(.horizontal, 12)
							.padding(.vertical, 6)
							.background(parent.id == selection ? Color.accentColor : Color(.secondarySystemFill))
							.foregroundStyle(parent.id == selection ? Color.white : Color.primary)
							.clipShape(Capsule())
					}
					.accessibilityLabel("Back from \(parent.name)")
				}

				ForEach(shownCategories) { category in
					let isSelected = category.id == selection
					Button {
						if isSelected {
							selection = nil
						} else {
							selection = category.id
							if hasChildren(category.id) {
								currentParentId = category.id
							}
						}
					} label: {
						Text(category.name)
							.font(.subheadline.weight(.medium))
							.padding(.horizontal, 14)
							.padding(.vertical, 6)
							.background(isSelected ? Color.accentColor : Color(.secondarySystemFill))
							.foregroundStyle(isSelected ? Color.white : Color.primary)
							.clipShape(Capsule())
					}
					.accessibilityAddTraits(isSelected ? [.isSelected] : [])
				}
			}
			.padding(.horizontal, 4)
		}
		.onChange(of: selection) { _, newValue in
			// Sync drill-down level with external selection changes
			if let newValue, let cat = categoriesById[newValue] {
				if hasChildren(newValue) {
					currentParentId = newValue
				} else if let pid = cat.parentId {
					currentParentId = pid
				}
			}
		}
	}
}
