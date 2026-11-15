import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct ImmichTests {
	@Test func connectionCanBeDisconnectedAndReconnected() async {
		let api = FixtureWardrobeAPI()
		let model = ImmichSettingsModel(api: api)
		await model.load()
		#expect(model.status?.connected == true)
		await model.disconnect()
		#expect(model.status?.connected == false)
		model.key = "test-key"
		await model.connect()
		#expect(model.status?.connected == true)
		#expect(model.key.isEmpty)
	}

	@Test func pickerLinksAndRemovesAsset() async throws {
		let api = FixtureWardrobeAPI()
		let picker = ImmichPickerModel(api: api)
		await picker.loadStatus()
		let asset = try #require(picker.assets.first)
		picker.selected.insert(asset.id)
		let outfitId = "50000000-0000-4000-8000-000000000001"
		let linked = try #require(await picker.link(outfitId: outfitId))
		#expect(linked.count == 1)
		let gallery = OutfitPhotosModel(api: api, photos: linked)
		await gallery.remove(try #require(linked.first), outfitId: outfitId)
		#expect(gallery.photos.isEmpty)
	}
}
