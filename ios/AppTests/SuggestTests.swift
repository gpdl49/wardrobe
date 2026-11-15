import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

/// Exercises the suggestion flow against the in-memory API.
@Suite @MainActor struct SuggestTests {
	@Test func requestAndFeedback() async throws {
		let api = FixtureWardrobeAPI()
		let model = OutfitSuggestModel(api: api, ownerId: nil)
		await model.load()
		model.prompt = "  Weekend  "
		model.season = .summer
		model.count = 2
		model.selectedItems = Set(model.items.prefix(1).map(\.id))
		#expect(model.request.prompt == "Weekend")
		#expect(model.request.itemIds?.count == 1)
		await model.submit()
		let proposal = try #require(model.runs.first?.suggestions.first)
		await model.save(proposal)
		#expect(model.runs.first?.suggestions.first?.feedback == .saved)
		#expect(model.savedOutfitId != nil)
		await model.submit()
		let second = try #require(model.runs.first?.suggestions.first)
		await model.dismiss(second)
		#expect(model.runs.first?.suggestions.first?.feedback == .dismissed)
	}

	@Test func pollingAndErrors() async throws {
		let api = FixtureWardrobeAPI()
		let model = OutfitSuggestModel(api: api, ownerId: nil)
		await model.load()
		var pending = try #require(model.runs.first)
		pending.status = .running
		model.replace(pending)
		await model.pollOnce()
		#expect(model.runs.first?.status == .done)
		await api.setNextError(APIError(status: 403, error: "forbidden", message: "No access"))
		await model.bulk(queue: true)
		#expect(model.errorMessage != nil)
	}

	@Test func bulkCountsAndValidation() async {
		let model = OutfitSuggestModel(api: FixtureWardrobeAPI(), ownerId: nil)
		await model.bulk(queue: true)
		#expect(model.bulkMessage == "Queued suggestions for 0 items.")
		await model.bulk(queue: false)
		#expect(model.bulkMessage == "Applied tags to 0 items.")
		model.prompt = String(repeating: "a", count: 501)
		await model.submit()
		#expect(model.runs.isEmpty)
	}
}
