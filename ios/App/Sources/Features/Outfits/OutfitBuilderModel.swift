import Foundation
import Observation
import WardrobeKit

/// Editable outfit fields and the ordered selection of wardrobe items.
@MainActor @Observable
final class OutfitBuilderModel {
	let api: any WardrobeAPI
	let ownerId: ID?
	let original: OutfitDetailDTO?
	var appModel: AppModel?
	var name: String
	var notes: String
	var tags: String
	var seasons: [Season]
	var selected: [ItemSummaryDTO]
	var available: [ItemSummaryDTO] = []
	var errorMessage: String?
	var saving = false
	private let key = UUID().uuidString
	init(api: any WardrobeAPI, ownerId: ID?, outfit: OutfitDetailDTO? = nil) {
		self.api = api; self.ownerId = ownerId; original = outfit
		name = outfit?.name ?? ""; notes = outfit?.notes ?? ""
		tags = outfit?.tags.joined(separator: ", ") ?? ""
		seasons = outfit?.seasons ?? []; selected = outfit?.items ?? []
	}
	var tagValues: [String] {
		var seen = Set<String>()
		return tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
			.filter { !$0.isEmpty && seen.insert($0).inserted }
	}
	var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.count <= 200 && selected.count <= 50 }
	func toggle(_ item: ItemSummaryDTO) {
		if let index = selected.firstIndex(where: { $0.id == item.id }) { selected.remove(at: index) }
		else if selected.count < 50 { selected.append(item) }
	}
	func loadItems() async {
		do {
			var cursor: String?
			repeat {
				let page = try await api.items(ItemQuery(owner: ownerId, cursor: cursor, limit: 100))
				available.append(contentsOf: page.items)
				cursor = page.nextCursor
			} while cursor != nil
		} catch { errorMessage = outfitErrorMessage(error, appModel: appModel) }
	}
	func save() async -> OutfitDetailDTO? {
		guard valid, !saving else { return nil }
		saving = true
		defer { saving = false }
		let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
		let cleanNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
		do {
			if let original {
				return try await api.updateOutfit(id: original.id, UpdateOutfitRequest(
					name: cleanName, notes: cleanNotes.isEmpty ? .null : .value(cleanNotes),
					seasons: seasons, tags: tagValues, itemIds: selected.map(\.id)))
			}
			return try await api.createOutfit(CreateOutfitRequest(
				name: cleanName, notes: cleanNotes.isEmpty ? nil : cleanNotes, seasons: seasons,
				tags: tagValues, itemIds: selected.map(\.id), ownerId: ownerId), idempotencyKey: key)
		} catch { errorMessage = outfitErrorMessage(error, appModel: appModel); return nil }
	}
}
