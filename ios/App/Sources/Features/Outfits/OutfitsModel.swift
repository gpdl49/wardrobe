import Foundation
import Observation
import WardrobeKit

/// Loads outfits for the selected wardrobe and the caller's direct shares.
@MainActor @Observable
final class OutfitsModel {
	let api: any WardrobeAPI
	var appModel: AppModel?
	var outfits: [OutfitSummaryDTO] = []
	var shared: [OutfitSummaryDTO] = []
	var search = ""
	var tag = ""
	var season: Season?
	var ownerId: ID?
	var nextCursor: String?
	var loading = false
	var errorMessage: String?

	init(api: any WardrobeAPI) { self.api = api }
	var query: OutfitQuery {
		OutfitQuery(owner: ownerId, q: search.trimmed.nilIfEmpty, tag: tag.trimmed.nilIfEmpty, season: season)
	}
	func load(ownerId: ID?) async {
		self.ownerId = ownerId
		loading = true
		defer { loading = false }
		let request = query
		do {
			let result = try await api.outfits(request)
			guard !Task.isCancelled, request == query else { return }
			outfits = result.outfits
			nextCursor = result.nextCursor
			shared = try await api.sharedOutfits()
		} catch { errorMessage = outfitErrorMessage(error, appModel: appModel) }
	}
	func loadMore() async {
		guard let cursor = nextCursor, !loading else { return }
		loading = true
		defer { loading = false }
		var request = query
		request.cursor = cursor
		do {
			let result = try await api.outfits(request)
			outfits.append(contentsOf: result.outfits)
			nextCursor = result.nextCursor
		} catch { errorMessage = outfitErrorMessage(error, appModel: appModel) }
	}
}

/// Loads and mutates one outfit, including owner-only sharing.
@MainActor @Observable
final class OutfitDetailModel {
	let api: any WardrobeAPI
	let outfitId: ID
	var appModel: AppModel?
	var outfit: OutfitDetailDTO?
	var errorMessage: String?
	init(api: any WardrobeAPI, outfitId: ID) { self.api = api; self.outfitId = outfitId }
	func load() async {
		do { outfit = try await api.outfit(id: outfitId) }
		catch { errorMessage = outfitErrorMessage(error, appModel: appModel) }
	}
	func delete() async -> Bool {
		do { try await api.deleteOutfit(id: outfitId); return true }
		catch { errorMessage = outfitErrorMessage(error, appModel: appModel); return false }
	}
	func share(_ grantee: String) async -> Bool {
		do {
			_ = try await api.createOutfitShare(outfitId: outfitId, CreateOutfitShareRequest(grantee: grantee.trimmed))
			await load(); return true
		} catch { errorMessage = outfitErrorMessage(error, appModel: appModel); return false }
	}
	func revoke(_ share: OutfitShareDTO) async {
		do { try await api.deleteOutfitShare(outfitId: outfitId, shareId: share.id); await load() }
		catch { errorMessage = outfitErrorMessage(error, appModel: appModel) }
	}
	/// Only items the viewer can open on their own; the rest are visible only through the outfit.
	static func canOpen(_ item: ItemSummaryDTO, in outfit: OutfitDetailDTO) -> Bool {
		outfit.readableItemIds.contains(item.id)
	}
}

extension String {
	fileprivate var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
	fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// Route errors through the app when available, including session expiry.
@MainActor
func outfitErrorMessage(_ error: any Error, appModel: AppModel?) -> String? {
	if let appModel { return appModel.message(for: error) }
	return error.localizedDescription
}
