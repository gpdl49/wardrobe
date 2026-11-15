import Foundation
import Testing
import WardrobeKit
import WardrobeKitTesting
@testable import Wardrobe

@MainActor
@Suite struct LocationDetailTests {
	let closetId = "10000000-0000-4000-8000-000000000001"
	let bagId = "10000000-0000-4000-8000-000000000002"

	@Test func loadFetchesLocationDetailAndItems() async {
		let api = FixtureWardrobeAPI()
		let model = LocationDetailModel(api: api, locationId: closetId)

		await model.load()

		#expect(model.detail != nil)
		#expect(model.detail?.code == "CL-BEDROOM")
		#expect(model.detail?.items.count == 2)
		#expect(model.canEdit == true)
	}

	@Test func deleteLocationWithItemsThrows409AndSetsErrorMessage() async {
		let api = FixtureWardrobeAPI()
		// closet holds items in FixtureWardrobeAPI seed data
		let model = LocationDetailModel(api: api, locationId: closetId)
		await model.load()

		await #expect(throws: APIError.self) {
			try await model.delete()
		}

		#expect(model.errorMessage == "Still holds items")
		#expect(model.isDeleted == false)
	}

	@Test func deleteEmptyLocationSucceeds() async throws {
		let api = FixtureWardrobeAPI()
		// Create an empty location
		let created = try await api.createLocation(
			CreateLocationRequest(kind: .drawer, code: "DR-EMPTY", name: "Empty Drawer")
		)

		let model = LocationDetailModel(api: api, locationId: created.id)
		await model.load()

		try await model.delete()

		#expect(model.isDeleted == true)
		#expect(model.errorMessage == nil)
	}

	@Test func archiveAndRestoreUpdatesArchivedStatus() async {
		let api = FixtureWardrobeAPI()
		let model = LocationDetailModel(api: api, locationId: bagId)
		await model.load()
		#expect(model.detail?.archivedAt == nil)

		await model.archive()
		#expect(model.detail?.archivedAt != nil)

		await model.restore()
		#expect(model.detail?.archivedAt == nil)
	}

	@Test func moveSelectedItemsTransfersItems() async {
		let api = FixtureWardrobeAPI()
		let model = LocationDetailModel(api: api, locationId: closetId)
		await model.load()

		let itemIds = model.detail?.items.map(\.id) ?? []
		#expect(itemIds.count == 2)

		// Move all items from closet to bag
		await model.moveItems(itemIds: itemIds, toLocationId: bagId)

		#expect(model.detail?.items.isEmpty == true)
		#expect(model.selectedItemIds.isEmpty == true)

		// Verify bag now holds those items
		let bagDetail = try? await api.location(id: bagId)
		#expect(bagDetail?.items.count == 3) // 1 originally + 2 moved
	}
}
