import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct ItemDetailModelTests {
	let testItemId = "30000000-0000-4000-8000-000000000001"

	@Test func loadItemAndCategories() async {
		let api = FixtureWardrobeAPI()
		let vm = ItemDetailModel(itemId: testItemId, api: api)

		#expect(vm.item == nil)
		await vm.load()

		#expect(vm.item?.id == testItemId)
		#expect(vm.item?.name == "Navy cardigan")
		#expect(!vm.categories.isEmpty)
		#expect(vm.errorMessage == nil)
	}

	@Test func permissionGating() async {
		let api = FixtureWardrobeAPI()
		let vm = ItemDetailModel(itemId: testItemId, api: api)
		await vm.load()

		// Owner access
		#expect(vm.item?.access == .owner)
		#expect(vm.canEdit == true)

		// Edit access
		vm.item?.access = .edit
		#expect(vm.canEdit == true)

		// View access hides edit capabilities
		vm.item?.access = .view
		#expect(vm.canEdit == false)
	}

	@Test func photoManagement() async throws {
		let api = FixtureWardrobeAPI()
		let photoId = "photo-100"
		let now = Date()
		let photo = PhotoDTO(
			id: photoId,
			ownerId: FixtureWardrobeAPI.meID,
			access: .owner,
			itemId: testItemId,
			kind: .main,
			status: .ready,
			contentType: "image/jpeg",
			size: 1024,
			createdAt: now
		)
		await api.seedPhoto(photo)

		let vm = ItemDetailModel(itemId: testItemId, api: api)
		await vm.load()

		#expect(vm.item?.photos.count == 1)

		await vm.removePhotoBackground(photoId: photoId)
		#expect(vm.item?.photos.first?.backgroundStatus == .ready)
		#expect(vm.item?.photos.first?.rendition(.display) == .cutoutDisplay)
		#expect(vm.item?.photos.first?.rendition(.original) == .original)

		// Change photo kind
		await vm.changePhotoKind(photoId: photoId, kind: .label)
		let updated1 = try await api.item(id: testItemId)
		#expect(updated1.photos.first(where: { $0.id == photoId })?.kind == .label)
		#expect(updated1.photos.first?.rendition(.display) == .display)

		// Set cover photo
		await vm.setCoverPhoto(photoId: photoId)
		let updated2 = try await api.item(id: testItemId)
		#expect(updated2.coverPhoto?.id == photoId)

		// Delete photo
		await vm.deletePhoto(photoId: photoId)
		let updated3 = try await api.item(id: testItemId)
		#expect(updated3.photos.isEmpty)
	}

	@Test func rerunAnalysesAndHandle409() async {
		let api = FixtureWardrobeAPI()
		let vm = ItemDetailModel(itemId: testItemId, api: api)
		await vm.load()

		// Happy path
		await vm.rerunAnalyses()
		#expect(vm.analysisMessage == nil)
		#expect(vm.item?.analyses.count == 2)

		// 409 Vision disabled
		await api.setNextError(APIError(status: 409, error: "vision_disabled", message: "Vision disabled"))
		await vm.rerunAnalyses()
		#expect(vm.analysisMessage == "Vision analysis is disabled on this server.")
	}

	@Test func applySuggestion() async {
		let api = FixtureWardrobeAPI()
		let vm = ItemDetailModel(itemId: testItemId, api: api)
		await vm.load()
		await vm.rerunAnalyses()

		guard let analysis = vm.item?.analyses.first(where: { $0.result?.name != nil }) else {
			Issue.record("Expected analysis with name suggestion")
			return
		}

		await vm.applySuggestion(analysisId: analysis.id, fields: [.name])
		#expect(vm.item?.name == "Suggested Cardigan")
	}

	@Test func deleteItem() async {
		let api = FixtureWardrobeAPI()
		let vm = ItemDetailModel(itemId: testItemId, api: api)
		await vm.load()

		let success = await vm.deleteItem()
		#expect(success == true)
		#expect(vm.isDeleted == true)

		let remaining = await api.items
		#expect(!remaining.contains { $0.id == testItemId })
	}

	@Test func pollingStartsOnlyWhenPhotosProcessing() async {
		let api = FixtureWardrobeAPI()
		let vm = ItemDetailModel(itemId: testItemId, api: api)
		await vm.load()

		// No processing photos -> polling should not start
		#expect(vm.isPolling == false)
		vm.startPollingIfNeeded()
		#expect(vm.isPolling == false)

		// Add a processing photo
		let processingPhoto = PhotoDTO(
			id: "photo-proc",
			ownerId: FixtureWardrobeAPI.meID,
			access: .owner,
			itemId: testItemId,
			kind: .main,
			status: .processing,
			contentType: "image/jpeg",
			size: 2048,
			createdAt: Date()
		)
		vm.item?.photos.append(processingPhoto)

		// Now polling should start
		vm.startPollingIfNeeded()
		#expect(vm.isPolling == true)

		// Stop polling
		vm.stopPolling()
		#expect(vm.isPolling == false)
	}
}
