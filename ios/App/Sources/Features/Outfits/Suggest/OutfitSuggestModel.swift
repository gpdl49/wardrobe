import Foundation
import Observation
import WardrobeKit

/// State and actions for outfit suggestions in one wardrobe.
@MainActor
@Observable
final class OutfitSuggestModel {
	let api: any WardrobeAPI
	let ownerId: ID?
	weak var appModel: AppModel?
	var prompt = ""
	var season: Season?
	var count = 3
	var selectedItems: Set<ID> = []
	private(set) var items: [ItemSummaryDTO] = []
	private(set) var runs: [SuggestionRunDTO] = []
	private(set) var busy = false
	private(set) var actionId: ID?
	var errorMessage: String?
	var bulkMessage: String?
	var savedOutfitId: ID?
	private var pendingRequest: (CreateSuggestionRunRequest, String)?
	private var saveKeys: [ID: String] = [:]

	init(api: any WardrobeAPI, ownerId: ID?) {
		self.api = api
		self.ownerId = ownerId
	}

	var request: CreateSuggestionRunRequest {
		let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
		return CreateSuggestionRunRequest(
			ownerId: ownerId, prompt: text.isEmpty ? nil : text, season: season,
			itemIds: selectedItems.isEmpty ? nil : selectedItems.sorted(), count: count
		)
	}

	func load() async {
		do {
			runs = try await api.suggestionRuns(owner: ownerId)
			var cursor: String?
			var all: [ItemSummaryDTO] = []
			repeat {
				let page = try await api.items(ItemQuery(owner: ownerId, cursor: cursor, limit: 100))
				all.append(contentsOf: page.items)
				cursor = page.nextCursor
			} while cursor != nil && !Task.isCancelled
			items = all
		} catch { report(error) }
	}

	func pollOnce() async {
		for run in runs where run.status == .queued || run.status == .running {
			do { replace(try await api.suggestionRun(id: run.id)) }
			catch { report(error) }
		}
	}

	func poll() async {
		while !Task.isCancelled {
			await pollOnce()
			do { try await Task.sleep(for: .seconds(3)) } catch { return }
		}
	}

	func submit() async {
		guard !busy, prompt.count <= 500, selectedItems.count <= 5 else { return }
		busy = true
		defer { busy = false }
		do {
			let body = request
			if pendingRequest?.0 != body { pendingRequest = (body, UUID().uuidString) }
			let run = try await api.createSuggestionRun(body, idempotencyKey: pendingRequest!.1)
			pendingRequest = nil
			runs.insert(run, at: 0)
		} catch { report(error) }
	}

	func save(_ suggestion: OutfitSuggestionDTO) async {
		guard actionId == nil else { return }
		actionId = suggestion.id
		defer { actionId = nil }
		do {
			let key = saveKeys[suggestion.id] ?? UUID().uuidString
			saveKeys[suggestion.id] = key
			let outfit = try await api.createOutfit(
				CreateOutfitRequest(name: suggestion.name, itemIds: suggestion.items.map(\.id),
					ownerId: ownerId, suggestionId: suggestion.id), idempotencyKey: key)
			saveKeys[suggestion.id] = nil
			var updated = suggestion
			updated.feedback = .saved
			updated.outfitId = outfit.id
			replace(updated)
			savedOutfitId = outfit.id
		} catch { report(error) }
	}

	func dismiss(_ suggestion: OutfitSuggestionDTO) async {
		guard actionId == nil else { return }
		actionId = suggestion.id
		defer { actionId = nil }
		do { replace(try await api.dismissSuggestion(id: suggestion.id)) }
		catch { report(error) }
	}

	func bulk(queue: Bool) async {
		guard !busy else { return }
		busy = true
		defer { busy = false }
		do {
			let body = BulkItemsRequest(ownerId: ownerId)
			if queue {
				let result = try await api.queueBulkAnalyses(body)
				bulkMessage = "Queued suggestions for \(result.queued) items."
			} else {
				let result = try await api.applyBulkTags(body)
				bulkMessage = "Applied tags to \(result.updated) items."
			}
		} catch { report(error) }
	}

	func replace(_ run: SuggestionRunDTO) {
		if let index = runs.firstIndex(where: { $0.id == run.id }) { runs[index] = run }
	}

	private func replace(_ suggestion: OutfitSuggestionDTO) {
		guard let i = runs.firstIndex(where: { $0.id == suggestion.runId }),
			let j = runs[i].suggestions.firstIndex(where: { $0.id == suggestion.id }) else { return }
		runs[i].suggestions[j] = suggestion
	}

	private func report(_ error: any Error) {
		errorMessage = appModel?.message(for: error) ?? (appModel == nil ? error.localizedDescription : nil)
	}
}
