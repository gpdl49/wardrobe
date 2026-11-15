import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

private actor ScriptedCatalogueAPI: WardrobeAPI {
	var capturedQueries: [ItemQuery] = []
	var pages: [ItemListDTO] = []
	var currentPage = 0

	init(pages: [ItemListDTO] = []) {
		self.pages = pages
	}

	func items(_ query: ItemQuery) async throws -> ItemListDTO {
		capturedQueries.append(query)
		guard currentPage < pages.count else {
			return ItemListDTO(items: [], nextCursor: nil)
		}
		let page = pages[currentPage]
		currentPage += 1
		return page
	}

	// Unused stubs
	func me() async throws -> MeDTO { throw APIError(status: 500, error: "unused", message: "") }
	func health() async throws -> Bool { true }
	func locations(_ query: LocationQuery) async throws -> [LocationDTO] { [] }
	func location(id: ID) async throws -> LocationDetailDTO { throw APIError(status: 404, error: "not_found", message: "") }
	func location(code: String, owner: ID?) async throws -> LocationDTO { throw APIError(status: 404, error: "not_found", message: "") }
	func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO { throw APIError(status: 500, error: "unused", message: "") }
	func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO { throw APIError(status: 500, error: "unused", message: "") }
	func deleteLocation(id: ID) async throws {}
	func categories() async throws -> [CategoryDTO] { [] }
	func tags(owner: ID?) async throws -> [TagCountDTO] { [] }
	func item(id: ID) async throws -> ItemDetailDTO { throw APIError(status: 404, error: "not_found", message: "") }
	func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO { throw APIError(status: 500, error: "unused", message: "") }
	func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO { throw APIError(status: 500, error: "unused", message: "") }
	func deleteItem(id: ID) async throws {}
	func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult { MoveItemsResult(moved: 0) }
	func analyses(itemId: ID) async throws -> [AnalysisDTO] { [] }
	func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] { [] }
	func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO { throw APIError(status: 500, error: "unused", message: "") }
	func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO { throw APIError(status: 500, error: "unused", message: "") }
	func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws {}
	func completePhoto(id: ID) async throws -> PhotoDTO { throw APIError(status: 500, error: "unused", message: "") }
	func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO { throw APIError(status: 500, error: "unused", message: "") }
	func deletePhoto(id: ID) async throws {}
	func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? { nil }
	func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO { throw APIError(status: 500, error: "unused", message: "") }
	func session(id: ID) async throws -> PackingSessionDetailDTO { throw APIError(status: 500, error: "unused", message: "") }
	func endSession(id: ID) async throws -> PackingSessionDTO { throw APIError(status: 500, error: "unused", message: "") }
	func shares() async throws -> [ShareDTO] { [] }
	func createShare(_ body: CreateShareRequest) async throws -> ShareDTO { throw APIError(status: 500, error: "unused", message: "") }
	func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO { throw APIError(status: 500, error: "unused", message: "") }
	func deleteShare(id: ID) async throws {}
	func sharedWithMe() async throws -> [SharedWithMeDTO] { [] }
}

@MainActor
@Suite struct CatalogueTests {
	private func makeItem(id: ID, name: String) -> ItemSummaryDTO {
		let now = Date(timeIntervalSince1970: 1_763_200_000)
		return ItemSummaryDTO(
			id: id,
			ownerId: "u1",
			access: .owner,
			name: name,
			status: .active,
			createdAt: now,
			updatedAt: now
		)
	}

	@Test func queryBuildingFromFiltersAndScope() async {
		let api = ScriptedCatalogueAPI()
		let ownScope = WardrobeScope(ownerId: "u1", title: "My wardrobe", access: .owner, location: nil)
		let model = CatalogueModel(api: api, scope: ownScope)

		model.selectedLocationId = "loc-1"
		model.selectedCategoryId = "cat-2"
		model.selectedTag = "wool"
		model.selectedSeason = .winter
		model.selectedStatus = .stored
		model.selectedColor = "navy"
		await model.applySearchImmediate("cardigan")

		let query = model.buildQuery()
		#expect(query.owner == nil) // Own wardrobe omits owner
		#expect(query.location == "loc-1")
		#expect(query.category == "cat-2")
		#expect(query.tag == "wool")
		#expect(query.season == .winter)
		#expect(query.status == .stored)
		#expect(query.color == "navy")
		#expect(query.q == "cardigan")
		#expect(query.limit == 50)

		// Shared scope with restricted location
		let sharedScope = WardrobeScope(
			ownerId: "u2",
			title: "Alice",
			access: .view,
			location: SharedWithMeDTO.LocationStub(id: "loc-shared", code: "S-1", name: "Suitcase")
		)
		let sharedModel = CatalogueModel(api: api, scope: sharedScope)
		let sharedQuery = sharedModel.buildQuery()
		#expect(sharedQuery.owner == "u2")
		#expect(sharedQuery.location == "loc-shared")
	}

	@Test func paginationAppendAndStop() async {
		let item1 = makeItem(id: "i1", name: "Shirt")
		let item2 = makeItem(id: "i2", name: "Pants")
		let item3 = makeItem(id: "i3", name: "Jacket")

		let page1 = ItemListDTO(items: [item1, item2], nextCursor: "cursor-1")
		let page2 = ItemListDTO(items: [item3], nextCursor: nil)

		let api = ScriptedCatalogueAPI(pages: [page1, page2])
		let model = CatalogueModel(api: api)

		await model.reload()
		#expect(model.items.count == 2)
		#expect(model.items.map(\.id) == ["i1", "i2"])
		#expect(model.nextCursor == "cursor-1")

		await model.loadMore()
		#expect(model.items.count == 3)
		#expect(model.items.map(\.id) == ["i1", "i2", "i3"])
		#expect(model.nextCursor == nil)

		// Subsequent loadMore does nothing because nextCursor is nil
		await model.loadMore()
		#expect(model.items.count == 3)
	}

	@Test func searchDebounce() async throws {
		let fixture = FixtureWardrobeAPI()
		let model = CatalogueModel(api: fixture)

		model.searchText = "Navy"
		#expect(model.debouncedSearchText == "")

		// Allow debounce timer to fire (300 ms)
		try await Task.sleep(nanoseconds: 350_000_000)
		#expect(model.debouncedSearchText == "Navy")
		#expect(model.items.count == 1)
		#expect(model.items.first?.name == "Navy cardigan")
	}

	@Test func resetOnScopeChange() async {
		let fixture = FixtureWardrobeAPI()
		let model = CatalogueModel(api: fixture)

		model.selectedLocationId = "10000000-0000-4000-8000-000000000001"
		model.selectedTag = "wool"
		await model.reload()
		#expect(model.items.count == 0) // no wool tag in that closet

		let friendScope = WardrobeScope(
			ownerId: FixtureWardrobeAPI.friendID,
			title: "Friend",
			access: .view,
			location: nil
		)

		await model.updateScope(friendScope)
		#expect(model.scope?.id == friendScope.id)
		#expect(model.selectedLocationId == nil) // Reset
		#expect(model.selectedTag == nil)        // Reset
	}

	@Test func activeFilterCountsAndClearing() async {
		let fixture = FixtureWardrobeAPI()
		let model = CatalogueModel(api: fixture)

		#expect(model.activeFilterCount == 0)
		#expect(!model.hasActiveFiltersOrSearch)

		model.selectedSeason = .winter
		model.selectedStatus = .active
		model.selectedColor = "navy"

		#expect(model.activeFilterCount == 3)
		#expect(model.hasActiveFiltersOrSearch)
		#expect(model.activeFilterItems.count == 3)

		await model.clearFilter(.season(.winter))
		#expect(model.activeFilterCount == 2)
		#expect(model.selectedSeason == nil)

		await model.clearFilters()
		#expect(model.activeFilterCount == 0)
		#expect(model.selectedStatus == nil)
		#expect(model.selectedColor == nil)
		#expect(!model.hasActiveFiltersOrSearch)
	}
}
