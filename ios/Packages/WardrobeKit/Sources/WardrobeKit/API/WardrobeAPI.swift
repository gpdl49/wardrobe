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
