import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct OutfitTests {
	@Test func filtersAndScope() async {
		let api = FixtureWardrobeAPI()
		let model = OutfitsModel(api: api)
		model.search = "layers"; model.tag = "wool"; model.season = .autumn
		await model.load(ownerId: FixtureWardrobeAPI.meID)
		#expect(model.query.owner == FixtureWardrobeAPI.meID)
		#expect(model.outfits.count == 1)
		model.tag = "missing"
		await model.load(ownerId: FixtureWardrobeAPI.meID)
		#expect(model.outfits.isEmpty)
	}

	@Test func editPreservesOrderAndClearsNotes() async throws {
		let api = FixtureWardrobeAPI()
		let original = try await api.outfit(id: "50000000-0000-4000-8000-000000000001")
		let model = OutfitBuilderModel(api: api, ownerId: original.ownerId, outfit: original)
		model.name = " Changed "; model.notes = ""; model.tags = "one, two, one"
		model.selected.reverse()
		let saved = try #require(await model.save())
		#expect(saved.name == "Changed")
		#expect(saved.notes == nil)
		#expect(saved.tags == ["one", "two"])
		#expect(saved.items.map(\.id) == original.items.reversed().map(\.id))
	}

	@Test func selectionLimitAndRemoval() async {
		let model = OutfitBuilderModel(api: FixtureWardrobeAPI(), ownerId: nil)
		let items = (0..<51).map { ItemSummaryDTO(id: "\($0)", ownerId: "owner", access: .owner, createdAt: .now, updatedAt: .now) }
		for item in items { model.toggle(item) }
		#expect(model.selected.count == 50)
		model.toggle(items[0])
		model.toggle(items[50])
		#expect(model.selected.last?.id == items[50].id)
	}

	@Test func sharingAndNavigationGate() async throws {
		let api = FixtureWardrobeAPI()
		let model = OutfitDetailModel(api: api, outfitId: "50000000-0000-4000-8000-000000000001")
		await model.load()
		#expect(await model.share("friend@example.com"))
		let share = try #require(model.outfit?.shares.first)
		await model.revoke(share)
		#expect(model.outfit?.shares.isEmpty == true)
		let privateItem = ItemSummaryDTO(id: "private", ownerId: "other", access: .view, createdAt: .now, updatedAt: .now)
		#expect(!OutfitDetailModel.canOpen(privateItem))
		var ownItem = privateItem; ownItem.access = .owner
		#expect(OutfitDetailModel.canOpen(ownItem))
		let router = Router(); router.open(.outfit("id")); router.open(.suggest)
		#expect(router.path(.outfits) == [.outfit("id"), .suggest])
	}
}
