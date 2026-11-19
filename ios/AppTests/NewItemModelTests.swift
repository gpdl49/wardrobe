import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct NewItemModelTests {
	@Test func loadDataEndsAnExpiredSession() async {
		let api = FixtureWardrobeAPI()
		let app = AppModel.preview(api: api)
		let model = NewItemModel()
		model.appModel = app
		await api.setNextError(.signedOut)

		await model.loadData(api: api)

		#expect(app.auth.state == .signedOut)
	}

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
		let queue = UploadQueue(api: api, directory: URL.temporaryDirectory.appending(path: UUID().uuidString))
		// The real queue (WP3) only accepts captures once started for a user.
		queue.start(userSub: "test-sub")
		queue.pause()
		let model = NewItemModel()
		model.name = "Denim Jacket"
		let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0]) // fake jpeg
		let detail = PhotoSlot.detail(UUID())
		model.setPhoto(jpeg, for: detail)
		model.setPhoto(jpeg, for: .label)
		model.setPhoto(jpeg, for: .front)
		model.setPhoto(jpeg, for: .back)

		#expect(model.hasPhoto == true)
		_ = await model.create(api: api, uploads: queue)
		#expect(model.errorMessage == nil)

		// One item: the front creates it, every other photo waits for it.
		let jobs = queue.jobs
		#expect(jobs.map(\.kind) == [.main, .back, .label, .detail])
		guard case .newItem(let request) = jobs.first?.target, let parent = jobs.first?.id else {
			Issue.record("The front photo should create the item")
			return
		}
		#expect(request.name == "Denim Jacket")
		#expect(jobs.dropFirst().allSatisfy { $0.target == .afterJob(parent) })
	}

	@Test func slotsKeepFixedOrderAndDetailsInAddedOrder() {
		let model = NewItemModel()
		let first = PhotoSlot.detail(UUID())
		let second = PhotoSlot.detail(UUID())
		model.setPhoto(Data([1]), for: second)
		model.setPhoto(Data([2]), for: first)
		model.setPhoto(Data([3]), for: .label)
		#expect(model.slots == [.front, .back, .label, second, first])
		#expect(model.orderedPhotos.map(\.slot) == [.label, second, first])

		model.removePhoto(second)
		#expect(model.slots == [.front, .back, .label, first])
		model.setPhoto(Data([4]), for: .label)
		#expect(model.photos[.label] == Data([4]))
		model.removePhoto(.label)
		#expect(model.hasPhoto == true)
		model.removePhoto(first)
		#expect(model.hasPhoto == false)
	}

	@Test func itemPhotoKindsHaveFrontAndBackNames() {
		#expect(PhotoKind.itemKinds.map(\.displayName) == ["Front", "Back", "Label", "Detail"])
		#expect(PhotoKind.back.isGarment && PhotoKind.main.isGarment && !PhotoKind.label.isGarment)
	}
}
