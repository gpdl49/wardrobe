import Foundation

/// Every endpoint the app uses (docs/ios/api-contract.md). Implemented by
/// `LiveWardrobeAPI` (URLSession, WP1) and `FixtureWardrobeAPI`
/// (WardrobeKitTesting, previews and tests). Every method throws `APIError`.
///
/// `idempotencyKey` is required on the POSTs the contract makes idempotent;
/// callers create it once per user action and reuse it on every retry.
public protocol WardrobeAPI: Sendable {
	// Me
	func me() async throws -> MeDTO
	func health() async throws -> Bool

	// Locations
	func locations(_ query: LocationQuery) async throws -> [LocationDTO]
	func location(id: ID) async throws -> LocationDetailDTO
	func location(code: String, owner: ID?) async throws -> LocationDTO
	func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO
	func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO
	func deleteLocation(id: ID) async throws

	// Categories and tags
	func categories() async throws -> [CategoryDTO]
	func tags(owner: ID?) async throws -> [TagCountDTO]

	// Items
	func items(_ query: ItemQuery) async throws -> ItemListDTO
	func item(id: ID) async throws -> ItemDetailDTO
	func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO
	func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO
	func deleteItem(id: ID) async throws
	func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult

	// Analyses
	func analyses(itemId: ID) async throws -> [AnalysisDTO]
	func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO]
	func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO

	// Photos
	func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO
	/// PUT the bytes to a presigned URL with exactly `headers` and no
	/// Authorization. Throws `APIError(status: 403, error: "upload_expired")`
	/// when S3 says the URL expired.
	func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws
	func completePhoto(id: ID) async throws -> PhotoDTO
	func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO
	func deletePhoto(id: ID) async throws
	/// Resolves `GET /api/photos/{id}/{variant}`'s 302 without following it.
	/// Nil when the server answers 404 (not ready).
	func photoURL(id: ID, variant: PhotoVariant) async throws -> URL?

	// Sessions
	func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO
	func session(id: ID) async throws -> PackingSessionDetailDTO
	func endSession(id: ID) async throws -> PackingSessionDTO

	// Sharing
	func shares() async throws -> [ShareDTO]
	func createShare(_ body: CreateShareRequest) async throws -> ShareDTO
	func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO
	func deleteShare(id: ID) async throws
	func sharedWithMe() async throws -> [SharedWithMeDTO]
	// Outfits, Immich and suggestions
	func outfits(_ query: OutfitQuery) async throws -> OutfitListDTO
	func sharedOutfits() async throws -> [OutfitSummaryDTO]
	func outfit(id: ID) async throws -> OutfitDetailDTO
	func createOutfit(_ body: CreateOutfitRequest, idempotencyKey: String) async throws -> OutfitDetailDTO
	func updateOutfit(id: ID, _ body: UpdateOutfitRequest) async throws -> OutfitDetailDTO
	func deleteOutfit(id: ID) async throws
	func createOutfitShare(outfitId: ID, _ body: CreateOutfitShareRequest) async throws -> OutfitShareDTO
	func deleteOutfitShare(outfitId: ID, shareId: ID) async throws
	func immichStatus() async throws -> ImmichStatusDTO
	func connectImmich(_ body: ConnectImmichRequest) async throws -> ImmichStatusDTO
	func disconnectImmich() async throws
	func immichAssets(_ query: ImmichAssetQuery) async throws -> ImmichAssetListDTO
	func linkImmichAssets(outfitId: ID, _ body: LinkImmichAssetsRequest) async throws -> [OutfitPhotoDTO]
	func unlinkImmichAsset(outfitId: ID, linkId: ID) async throws
	func suggestionRuns(owner: ID?) async throws -> [SuggestionRunDTO]
	func suggestionRun(id: ID) async throws -> SuggestionRunDTO
	func createSuggestionRun(_ body: CreateSuggestionRunRequest, idempotencyKey: String) async throws -> SuggestionRunDTO
	func dismissSuggestion(id: ID) async throws -> OutfitSuggestionDTO
	func queueBulkAnalyses(_ body: BulkItemsRequest) async throws -> BulkAnalysesDTO
	func applyBulkTags(_ body: BulkItemsRequest) async throws -> BulkApplyTagsDTO
	func immichThumbnail(assetId: ID) async throws -> Data?
	func outfitImmichImage(outfitId: ID, linkId: ID, variant: PhotoVariant) async throws -> Data?
}

/// Supplies the bearer token for API requests (implemented by `AuthSession`).
public protocol TokenProvider: Sendable {
	/// A currently valid ID token, refreshing first when it expires in under
	/// 5 minutes. Throws `APIError.signedOut` when there is no session.
	func validToken() async throws -> String
	/// Called once when the server refused `rejected`; refreshes and returns
	/// a new token, or throws `APIError.signedOut` (and ends the session).
	func refreshAfterRejection(of rejected: String) async throws -> String
}

/// Default implementations allow focused test doubles to implement only their endpoints.
public extension WardrobeAPI {
	func outfits(_ query: OutfitQuery) async throws -> OutfitListDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func sharedOutfits() async throws -> [OutfitSummaryDTO] { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func outfit(id: ID) async throws -> OutfitDetailDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func createOutfit(_ body: CreateOutfitRequest, idempotencyKey: String) async throws -> OutfitDetailDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func updateOutfit(id: ID, _ body: UpdateOutfitRequest) async throws -> OutfitDetailDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func deleteOutfit(id: ID) async throws { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func createOutfitShare(outfitId: ID, _ body: CreateOutfitShareRequest) async throws -> OutfitShareDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func deleteOutfitShare(outfitId: ID, shareId: ID) async throws { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func immichStatus() async throws -> ImmichStatusDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func connectImmich(_ body: ConnectImmichRequest) async throws -> ImmichStatusDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func disconnectImmich() async throws { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func immichAssets(_ query: ImmichAssetQuery) async throws -> ImmichAssetListDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func linkImmichAssets(outfitId: ID, _ body: LinkImmichAssetsRequest) async throws -> [OutfitPhotoDTO] { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func unlinkImmichAsset(outfitId: ID, linkId: ID) async throws { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func suggestionRuns(owner: ID?) async throws -> [SuggestionRunDTO] { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func suggestionRun(id: ID) async throws -> SuggestionRunDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func createSuggestionRun(_ body: CreateSuggestionRunRequest, idempotencyKey: String) async throws -> SuggestionRunDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func dismissSuggestion(id: ID) async throws -> OutfitSuggestionDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func queueBulkAnalyses(_ body: BulkItemsRequest) async throws -> BulkAnalysesDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func applyBulkTags(_ body: BulkItemsRequest) async throws -> BulkApplyTagsDTO { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func immichThumbnail(assetId: ID) async throws -> Data? { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
	func outfitImmichImage(outfitId: ID, linkId: ID, variant: PhotoVariant) async throws -> Data? { throw APIError(status: 501, error: "unimplemented", message: "Endpoint not implemented") }
}
