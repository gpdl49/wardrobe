import Foundation

/// `WardrobeAPI` over URLSession against the real server
/// (docs/ios/api-contract.md "Requests", "Photos"). Shell from WP0; WP1
/// implements every method. The initializer is the contract.
public final class LiveWardrobeAPI: WardrobeAPI {
	public let baseURL: URL
	public let tokens: any TokenProvider

	/// - Parameters:
	///   - baseURL: e.g. https://wardrobe.vidur.xyz (no trailing /api).
	///   - tokens: bearer tokens; `StaticTokenProvider` for `AUTH_MODE=dev`.
	///   - configuration: injected in tests (URLProtocol stubs).
	public init(baseURL: URL, tokens: any TokenProvider, configuration: URLSessionConfiguration = .default) {
		self.baseURL = baseURL
		self.tokens = tokens
	}

	private static let todo = APIError(status: 501, error: "unimplemented", message: "LiveWardrobeAPI is not implemented yet")

	public func me() async throws -> MeDTO { throw Self.todo }
	public func health() async throws -> Bool { throw Self.todo }
	public func locations(_ query: LocationQuery) async throws -> [LocationDTO] { throw Self.todo }
	public func location(id: ID) async throws -> LocationDetailDTO { throw Self.todo }
	public func location(code: String, owner: ID?) async throws -> LocationDTO { throw Self.todo }
	public func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO { throw Self.todo }
	public func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO { throw Self.todo }
	public func deleteLocation(id: ID) async throws { throw Self.todo }
	public func categories() async throws -> [CategoryDTO] { throw Self.todo }
	public func tags(owner: ID?) async throws -> [TagCountDTO] { throw Self.todo }
	public func items(_ query: ItemQuery) async throws -> ItemListDTO { throw Self.todo }
	public func item(id: ID) async throws -> ItemDetailDTO { throw Self.todo }
	public func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO { throw Self.todo }
	public func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO { throw Self.todo }
	public func deleteItem(id: ID) async throws { throw Self.todo }
	public func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult { throw Self.todo }
	public func analyses(itemId: ID) async throws -> [AnalysisDTO] { throw Self.todo }
	public func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] { throw Self.todo }
	public func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO { throw Self.todo }
	public func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO { throw Self.todo }
	public func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws { throw Self.todo }
	public func completePhoto(id: ID) async throws -> PhotoDTO { throw Self.todo }
	public func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO { throw Self.todo }
	public func deletePhoto(id: ID) async throws { throw Self.todo }
	public func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? { throw Self.todo }
	public func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO { throw Self.todo }
	public func session(id: ID) async throws -> PackingSessionDetailDTO { throw Self.todo }
	public func endSession(id: ID) async throws -> PackingSessionDTO { throw Self.todo }
	public func shares() async throws -> [ShareDTO] { throw Self.todo }
	public func createShare(_ body: CreateShareRequest) async throws -> ShareDTO { throw Self.todo }
	public func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO { throw Self.todo }
	public func deleteShare(id: ID) async throws { throw Self.todo }
	public func sharedWithMe() async throws -> [SharedWithMeDTO] { throw Self.todo }
}

/// A fixed token: for `AUTH_MODE=dev` servers (which ignore it) and tests.
public struct StaticTokenProvider: TokenProvider {
	public let token: String
	public init(token: String = "dev") { self.token = token }
	public func validToken() async throws -> String { token }
	public func refreshAfterRejection(of rejected: String) async throws -> String { throw APIError.signedOut }
}
