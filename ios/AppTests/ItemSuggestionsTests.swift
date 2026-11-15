import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit

@Suite struct ItemSuggestionsTests {
	let now = Date()

	func makeItem(
		name: String? = "Navy Cardigan",
		categorySlug: String? = "knitwear",
		brand: String? = "Uniqlo",
		size: String? = "M",
		colors: [ItemColor] = [ItemColor(name: "navy", hex: "#1f2a44", share: 0.9)],
		pattern: String? = "solid",
		material: String? = "wool",
		seasons: [Season] = [.autumn, .winter],
		tags: [String] = ["warm", "knit"],
		notes: String? = "Care instructions: Hand wash only"
	) -> ItemDetailDTO {
		let cat = categorySlug.map { CategoryRef(id: "c1", name: $0.capitalized, slug: $0) }
		return ItemDetailDTO(
			id: "i1",
			ownerId: "u1",
			access: .owner,
			name: name,
			category: cat,
			brand: brand,
			size: size,
			colors: colors,
			pattern: pattern,
			material: material,
			seasons: seasons,
			status: .active,
			location: nil,
			notes: notes,
			tags: tags,
			coverPhoto: nil,
			createdAt: now,
			updatedAt: now,
			photos: [],
			movements: [],
			analyses: []
		)
	}

	@Test func matchingFieldEvaluation() {
		let item = makeItem()

		// Matching name
		#expect(ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .name,
			suggestion: ItemSuggestion(name: "navy cardigan")
		))

		// Non-matching name
		#expect(!ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .name,
			suggestion: ItemSuggestion(name: "Grey Hoodie")
		))

		// Matching category
		#expect(ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .categorySlug,
			suggestion: ItemSuggestion(categorySlug: "knitwear")
		))

		// Non-matching category
		#expect(!ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .categorySlug,
			suggestion: ItemSuggestion(categorySlug: "shirts")
		))

		// Matching colors
		#expect(ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .colors,
			suggestion: ItemSuggestion(colors: [ItemColor(name: "navy", hex: "#1f2a44", share: 0.8)])
		))

		// Non-matching colors
		#expect(!ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .colors,
			suggestion: ItemSuggestion(colors: [ItemColor(name: "black", hex: "#000000", share: 0.8)])
		))

		// Matching seasons
		#expect(ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .seasons,
			suggestion: ItemSuggestion(seasons: [.winter, .autumn])
		))

		// Matching tags (all suggested tags are present on item)
		#expect(ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .tags,
			suggestion: ItemSuggestion(tags: ["warm"])
		))

		// Non-matching tags (missing tag)
		#expect(!ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .tags,
			suggestion: ItemSuggestion(tags: ["warm", "merino"])
		))

		// Matching labelText (contained in notes)
		#expect(ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .labelText,
			suggestion: ItemSuggestion(labelText: "Hand wash only")
		))

		#expect(!ItemSuggestionsHelper.matchesItem(
			item: item,
			field: .labelText,
			suggestion: ItemSuggestion(labelText: "Dry clean only")
		))
	}

	@Test func availableAndOpenFields() {
		let item = makeItem()
		let suggestion = ItemSuggestion(
			name: "Navy Cardigan", // matches
			brand: "COS",           // doesn't match
			size: "L",             // doesn't match
			pattern: nil           // not available
		)

		let available = ItemSuggestionsHelper.availableFields(in: suggestion)
		#expect(available == [.name, .brand, .size])

		let open = ItemSuggestionsHelper.openFields(item: item, suggestion: suggestion)
		#expect(open == [.brand, .size])
	}
}
