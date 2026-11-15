import Foundation
import WardrobeKit

public enum ItemSuggestionsHelper {
	/// Display order and labels for suggestion fields (matching web contract)
	public static let fields: [(ItemSuggestion.Field, String)] = [
		(.name, "Name"),
		(.categorySlug, "Category"),
		(.brand, "Brand"),
		(.size, "Size"),
		(.colors, "Colours"),
		(.pattern, "Pattern"),
		(.material, "Material"),
		(.seasons, "Seasons"),
		(.tags, "Tags"),
		(.labelText, "Label")
	]

	/// True when the item already has what the analysis suggests for field.
	public static func matchesItem(
		item: ItemDetailDTO,
		field: ItemSuggestion.Field,
		suggestion: ItemSuggestion
	) -> Bool {
		switch field {
		case .categorySlug:
			return item.category?.slug == suggestion.categorySlug
		case .colors:
			let itemColorNames = Set(item.colors.map { $0.name.lowercased() })
			let suggColorNames = Set((suggestion.colors ?? []).map { $0.name.lowercased() })
			return !suggColorNames.isEmpty && itemColorNames == suggColorNames
		case .seasons:
			let itemSeasons = Set(item.seasons)
			let suggSeasons = Set(suggestion.seasons ?? [])
			return !suggSeasons.isEmpty && itemSeasons == suggSeasons
		case .tags:
			guard let suggTags = suggestion.tags, !suggTags.isEmpty else { return false }
			let itemTags = Set(item.tags.map { $0.lowercased() })
			return suggTags.allSatisfy { itemTags.contains($0.lowercased()) }
		case .labelText:
			guard let labelText = suggestion.labelText, !labelText.isEmpty else { return false }
			return item.notes?.contains(labelText) == true
		case .name:
			guard let sugg = suggestion.name else { return false }
			return (item.name ?? "").localizedCaseInsensitiveCompare(sugg) == .orderedSame
		case .brand:
			guard let sugg = suggestion.brand else { return false }
			return (item.brand ?? "").localizedCaseInsensitiveCompare(sugg) == .orderedSame
		case .size:
			guard let sugg = suggestion.size else { return false }
			return (item.size ?? "").localizedCaseInsensitiveCompare(sugg) == .orderedSame
		case .pattern:
			guard let sugg = suggestion.pattern else { return false }
			return (item.pattern ?? "").localizedCaseInsensitiveCompare(sugg) == .orderedSame
		case .material:
			guard let sugg = suggestion.material else { return false }
			return (item.material ?? "").localizedCaseInsensitiveCompare(sugg) == .orderedSame
		}
	}

	/// Fields an analysis has a value for, in display order.
	public static func availableFields(in suggestion: ItemSuggestion) -> [ItemSuggestion.Field] {
		fields.map(\.0).filter { field in
			switch field {
			case .name: return !(suggestion.name?.isEmpty ?? true)
			case .categorySlug: return !(suggestion.categorySlug?.isEmpty ?? true)
			case .brand: return !(suggestion.brand?.isEmpty ?? true)
			case .size: return !(suggestion.size?.isEmpty ?? true)
			case .colors: return !(suggestion.colors?.isEmpty ?? true)
			case .pattern: return !(suggestion.pattern?.isEmpty ?? true)
			case .material: return !(suggestion.material?.isEmpty ?? true)
			case .seasons: return !(suggestion.seasons?.isEmpty ?? true)
			case .tags: return !(suggestion.tags?.isEmpty ?? true)
			case .labelText: return !(suggestion.labelText?.isEmpty ?? true)
			}
		}
	}

	/// Open fields that don't match what the item already has.
	public static func openFields(item: ItemDetailDTO, suggestion: ItemSuggestion) -> [ItemSuggestion.Field] {
		availableFields(in: suggestion).filter { field in
			!matchesItem(item: item, field: field, suggestion: suggestion)
		}
	}
}
