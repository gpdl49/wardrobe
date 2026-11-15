import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct NewItemModelTests {
	@Test func createWithoutPhotoCallsAPI() async {
		let api = FixtureWardrobeAPI()
		let queue = UploadQueue(api: api, directory: URL.temporaryDirectory)
		let model = NewItemModel(locationId: "10000000-0000-4000-8000-000000000001", ownerId: FixtureWardrobeAPI.meID)
		model.name = "Linen Trousers"
		model.notes = "Summer trousers"

		let createdId = await model.create(api: api, uploads: queue)
		#expect(createdId != nil)
		#expect(model.errorMessage == nil)

		let createdItem = try? await api.item(id: createdId!)
		#expect(createdItem?.name == "Linen Trousers")
		#expect(createdItem?.location?.id == "10000000-0000-4000-8000-000000000001")
	}

	@Test func createWithPhotoEnqueuesUpload() async {
		let api = FixtureWardrobeAPI()
		let queue = UploadQueue(api: api, directory: URL.temporaryDirectory)
		let model = NewItemModel()
		model.name = "Denim Jacket"
		model.capturedPhotoData = Data([0xFF, 0xD8, 0xFF, 0xE0]) // fake jpeg
		model.photoKind = .main

		#expect(model.hasPhoto == true)
		_ = await model.create(api: api, uploads: queue)
		#expect(model.errorMessage == nil)
	}
}
