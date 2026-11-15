import Foundation
import Testing
import WardrobeKit
import WardrobeKitTesting
@testable import Wardrobe

@MainActor
@Suite struct SessionErrorTests {
	@Test func catalogueMetadataEndsSession() async {
		let api = FixtureWardrobeAPI()
		let app = AppModel.preview(api: api)
		let model = CatalogueModel(api: api)
		model.appModel = app
		await api.setNextError(.signedOut)
		await model.loadMetadata()
		#expect(app.auth.state == .signedOut)
	}

	@Test func locationLoadEndsSession() async {
		let api = FixtureWardrobeAPI()
		let app = AppModel.preview(api: api)
		let model = LocationDetailModel(api: api, locationId: "missing")
		model.appModel = app
		await api.setNextError(.signedOut)
		await model.load()
		#expect(app.auth.state == .signedOut)
	}

	@Test func packAndUnpackLoadsEndSession() async {
		let api = FixtureWardrobeAPI()
		let app = AppModel.preview(api: api)
		let pack = PackModel(api: api, uploads: app.uploads, userSub: UUID().uuidString)
		pack.appModel = app
		await api.setNextError(.signedOut)
		await pack.loadInitialData()
		#expect(app.auth.state == .signedOut)

		let app2 = AppModel.preview(api: api)
		let unpack = UnpackModel(api: api, userSub: UUID().uuidString)
		unpack.appModel = app2
		await api.setNextError(.signedOut)
		await unpack.loadInitialData()
		#expect(app2.auth.state == .signedOut)
	}

	@Test func shareCreationEndsSession() async {
		let api = FixtureWardrobeAPI()
		let app = AppModel.preview(api: api)
		let model = SharingModel(api: api)
		model.grantee = "friend@example.com"
		await api.setNextError(.signedOut)
		_ = await model.createShare(appModel: app)
		#expect(app.auth.state == .signedOut)
	}

	@Test func itemRefreshEndsSession() async {
		let api = FixtureWardrobeAPI()
		let app = AppModel.preview(api: api)
		let model = ItemDetailModel(itemId: "missing", api: api)
		model.appModel = app
		await api.setNextError(.signedOut)
		await model.refresh()
		#expect(app.auth.state == .signedOut)
	}
}
