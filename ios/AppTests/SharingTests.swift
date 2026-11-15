import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct SharingTests {
	// MARK: - Test Double

	final class MockSharingAPI: WardrobeAPI, @unchecked Sendable {
		var createdRequests: [CreateShareRequest] = []
		var updatedShares: [(id: ID, access: ShareAccess)] = []
		var deletedShareIDs: [ID] = []

		var sharesResult: [ShareDTO] = []
		var sharedWithMeResult: [SharedWithMeDTO] = []
		var locationsResult: [LocationDTO] = []

		var createError: (any Error)?
		var updateError: (any Error)?
		var deleteError: (any Error)?
		var loadError: (any Error)?

		private static var unimplemented: APIError {
			APIError(status: 501, error: "unimplemented", message: "unimplemented")
		}

		func me() async throws -> MeDTO {
			MeDTO(id: "u-me", sub: "sub-me", email: "me@example.com", username: "me", groups: ["wardrobe"], isAdmin: false)
		}
		func locations(_ query: LocationQuery) async throws -> [LocationDTO] {
			if let error = loadError { throw error }
			return locationsResult
		}
		func location(id: ID) async throws -> LocationDetailDTO { throw Self.unimplemented }
		func location(code: String, owner: ID?) async throws -> LocationDTO { throw Self.unimplemented }
		func health() async throws -> Bool { true }
		func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO { throw Self.unimplemented }
		func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO { throw Self.unimplemented }
		func deleteLocation(id: ID) async throws {}
		func categories() async throws -> [CategoryDTO] { [] }
		func tags(owner: ID?) async throws -> [TagCountDTO] { [] }
		func items(_ query: ItemQuery) async throws -> ItemListDTO {
			ItemListDTO(items: [], nextCursor: nil)
		}
		func item(id: ID) async throws -> ItemDetailDTO { throw Self.unimplemented }
		func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO { throw Self.unimplemented }
		func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO { throw Self.unimplemented }
		func deleteItem(id: ID) async throws {}
		func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult { throw Self.unimplemented }
		func analyses(itemId: ID) async throws -> [AnalysisDTO] { [] }
		func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] { [] }
		func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO { throw Self.unimplemented }
		func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO { throw Self.unimplemented }
		func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws {}
		func completePhoto(id: ID) async throws -> PhotoDTO { throw Self.unimplemented }
		func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO { throw Self.unimplemented }
		func deletePhoto(id: ID) async throws {}
		func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? { nil }
		func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO { throw Self.unimplemented }
		func session(id: ID) async throws -> PackingSessionDetailDTO { throw Self.unimplemented }
		func endSession(id: ID) async throws -> PackingSessionDTO { throw Self.unimplemented }

		func shares() async throws -> [ShareDTO] {
			if let error = loadError { throw error }
			return sharesResult
		}
		func createShare(_ body: CreateShareRequest) async throws -> ShareDTO {
			if let error = createError { throw error }
			createdRequests.append(body)
			return ShareDTO(
				id: "new-share-id",
				ownerId: "u-me",
				grantee: UserRef(id: "u-grantee", email: body.grantee.contains("@") ? body.grantee : nil, username: body.grantee.contains("@") ? nil : body.grantee),
				access: body.access,
				location: body.locationId.flatMap { locId in locationsResult.first { $0.id == locId }?.ref },
				createdAt: .now,
				updatedAt: .now
			)
		}
		func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO {
			if let error = updateError { throw error }
			updatedShares.append((id: id, access: access))
			return ShareDTO(
				id: id,
				ownerId: "u-me",
				grantee: UserRef(id: "u-grantee", email: "friend@example.com", username: "friend"),
				access: access,
				location: nil,
				createdAt: .now,
				updatedAt: .now
			)
		}
		func deleteShare(id: ID) async throws {
			if let error = deleteError { throw error }
			deletedShareIDs.append(id)
		}
		func sharedWithMe() async throws -> [SharedWithMeDTO] {
			if let error = loadError { throw error }
			return sharedWithMeResult
		}
	}

	// MARK: - Validation Tests

	@Test func formValidationRejectsEmptyGrantee() {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		vm.grantee = ""
		#expect(!vm.validateForm())
		#expect(vm.formError == "Enter an email or username")

		vm.grantee = "   \n  "
		#expect(!vm.validateForm())
		#expect(vm.formError == "Enter an email or username")
	}

	@Test func formValidationAcceptsValidGrantee() {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		vm.grantee = "friend@example.com"
		#expect(vm.validateForm())
		#expect(vm.formError == nil)

		vm.grantee = "sam"
		#expect(vm.validateForm())
		#expect(vm.formError == nil)
	}

	// MARK: - Request Body Tests

	@Test func createShareBuildsCorrectRequestBodyForWholeWardrobe() async {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		vm.grantee = "  alex@example.com  "
		vm.access = .edit
		vm.selectedLocationId = nil

		let success = await vm.createShare()
		#expect(success)
		#expect(mock.createdRequests.count == 1)

		let req = mock.createdRequests[0]
		#expect(req.grantee == "alex@example.com")
		#expect(req.access == .edit)
		#expect(req.locationId == nil)

		// Form should reset on success
		#expect(vm.grantee == "")
		#expect(vm.selectedLocationId == nil)
		#expect(vm.access == .view)
		#expect(vm.formError == nil)
		#expect(vm.shares.count == 1)
	}

	@Test func createShareBuildsCorrectRequestBodyWithLocation() async {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		let locId = "loc-bedroom-closet"
		vm.grantee = "jordan"
		vm.access = .view
		vm.selectedLocationId = locId

		let success = await vm.createShare()
		#expect(success)
		#expect(mock.createdRequests.count == 1)

		let req = mock.createdRequests[0]
		#expect(req.grantee == "jordan")
		#expect(req.access == .view)
		#expect(req.locationId == locId)
	}

	// MARK: - Error Mapping Tests

	@Test func createShareMaps422UnprocessableInline() async {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		// 422: Unknown grantee
		mock.createError = APIError(status: 422, error: "unprocessable", message: "No user \"ghost\"; they must sign in once first")
		vm.grantee = "ghost"

		let success = await vm.createShare()
		#expect(!success)
		#expect(vm.formError == "No user \"ghost\"; they must sign in once first")

		// 422: Cannot share with yourself
		mock.createError = APIError(status: 422, error: "unprocessable", message: "You cannot share with yourself")
		vm.grantee = "me@example.com"

		let successSelf = await vm.createShare()
		#expect(!successSelf)
		#expect(vm.formError == "You cannot share with yourself")
	}

	@Test func createShareMaps409ConflictInline() async {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		mock.createError = APIError(status: 409, error: "conflict", message: "This is already shared with that user")
		vm.grantee = "already-shared@example.com"

		let success = await vm.createShare()
		#expect(!success)
		#expect(vm.formError == "This is already shared with that user")
	}

	// MARK: - Update and Revoke Tests

	@Test func updateShareCallsAPIAndUpdatesLocalList() async {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		let existingShare = ShareDTO(
			id: "s-1",
			ownerId: "u-me",
			grantee: UserRef(id: "u-2", email: "friend@example.com", username: "friend"),
			access: .view,
			location: nil,
			createdAt: .now,
			updatedAt: .now
		)
		vm.shares = [existingShare]

		await vm.updateShare(share: existingShare, newAccess: .edit)
		#expect(mock.updatedShares.count == 1)
		#expect(mock.updatedShares[0].id == "s-1")
		#expect(mock.updatedShares[0].access == .edit)
		#expect(vm.shares[0].access == .edit)
	}

	@Test func revokeShareCallsAPIAndRemovesFromLocalList() async {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		let share1 = ShareDTO(id: "s-1", ownerId: "u-me", grantee: UserRef(id: "u-1", email: "a@b.com", username: "a"), access: .view, createdAt: .now, updatedAt: .now)
		let share2 = ShareDTO(id: "s-2", ownerId: "u-me", grantee: UserRef(id: "u-2", email: "c@d.com", username: "c"), access: .edit, createdAt: .now, updatedAt: .now)
		vm.shares = [share1, share2]

		vm.requestRevoke(share: share1)
		#expect(vm.showRevokeConfirmation)
		#expect(vm.shareToRevoke?.id == "s-1")

		await vm.confirmRevoke()
		#expect(mock.deletedShareIDs == ["s-1"])
		#expect(vm.shares.map(\.id) == ["s-2"])
		#expect(!vm.showRevokeConfirmation)
		#expect(vm.shareToRevoke == nil)
	}

	// MARK: - "Shared with me" -> Scope Tests

	@Test func sharedWithMeSwitchesScopeAndCatalogueTab() {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		let appModel = AppModel.preview()
		let router = Router()

		let sharedShare = SharedWithMeDTO(
			id: "share-from-friend",
			owner: UserRef(id: "friend-id", email: "friend@example.com", username: "friend"),
			access: .view,
			location: nil
		)

		vm.selectSharedWithMe(sharedShare, appModel: appModel, router: router)

		#expect(router.tab == .catalogue)
		#expect(appModel.scope?.ownerId == "friend-id")
		#expect(appModel.scope?.access == .view)
		#expect(appModel.scope?.location == nil)
		#expect(appModel.scope?.title == "friend")
	}

	@Test func sharedWithMeWithLocationSwitchesScopeAndCatalogueTab() {
		let mock = MockSharingAPI()
		let vm = SharingModel(api: mock)

		let appModel = AppModel.preview()
		let router = Router()

		let sharedLocation = SharedWithMeDTO.LocationStub(id: "loc-winter", code: "B-07", name: "Winter box")
		let sharedShare = SharedWithMeDTO(
			id: "share-loc",
			owner: UserRef(id: "partner-id", email: "partner@example.com", username: "partner"),
			access: .edit,
			location: sharedLocation
		)

		vm.selectSharedWithMe(sharedShare, appModel: appModel, router: router)

		#expect(router.tab == .catalogue)
		#expect(appModel.scope?.ownerId == "partner-id")
		#expect(appModel.scope?.access == .edit)
		#expect(appModel.scope?.location?.id == "loc-winter")
		#expect(appModel.scope?.location?.code == "B-07")
		#expect(appModel.scope?.title == "partner: Winter box")
	}
}
