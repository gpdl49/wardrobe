import Foundation

/// `WardrobeAPI` over URLSession against the real server
/// (docs/ios/api-contract.md "Requests", "Photos").
public final class LiveWardrobeAPI: WardrobeAPI, Sendable {
	public let baseURL: URL
	public let tokens: any TokenProvider

	private let apiSession: URLSession
	private let s3Session: URLSession
	private let userAgent: String

	/// - Parameters:
	///   - baseURL: e.g. https://wardrobe.vidur.xyz (no trailing /api).
	///   - tokens: bearer tokens; `StaticTokenProvider` for `AUTH_MODE=dev`.
	///   - configuration: injected in tests (URLProtocol stubs).
	public init(baseURL: URL, tokens: any TokenProvider, configuration: URLSessionConfiguration = .default) {
		self.baseURL = baseURL
		self.tokens = tokens
		self.userAgent = UserAgent.format()

		let apiConfig = configuration.copy() as! URLSessionConfiguration
		apiConfig.timeoutIntervalForRequest = 30
		apiConfig.timeoutIntervalForResource = 30
		self.apiSession = URLSession(configuration: apiConfig, delegate: RedirectStopDelegate(), delegateQueue: nil)

		let s3Config = configuration.copy() as! URLSessionConfiguration
		s3Config.timeoutIntervalForRequest = 120
		s3Config.timeoutIntervalForResource = 120
		self.s3Session = URLSession(configuration: s3Config, delegate: nil, delegateQueue: nil)
	}

	// MARK: - Me & Health

	public func me() async throws -> MeDTO {
		try await request(method: "GET", path: "/api/me")
	}

	public func health() async throws -> Bool {
		let (_, response) = try await send(method: "GET", path: "/api/healthz", requiresAuth: false)
		return response.statusCode == 200
	}

	// MARK: - Locations

	public func locations(_ query: LocationQuery) async throws -> [LocationDTO] {
		try await request(method: "GET", path: "/api/locations", queryItems: query.queryItems)
	}

	public func location(id: ID) async throws -> LocationDetailDTO {
		try await request(method: "GET", path: "/api/locations/\(escapeSegment(id))")
	}

	public func location(code: String, owner: ID?) async throws -> LocationDTO {
		let q = owner.map { [URLQueryItem(name: "owner", value: $0)] } ?? []
		return try await request(method: "GET", path: "/api/locations/by-code/\(escapeSegment(code))", queryItems: q)
	}

	public func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "POST", path: "/api/locations", bodyData: data)
	}

	public func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "PATCH", path: "/api/locations/\(escapeSegment(id))", bodyData: data)
	}

	public func deleteLocation(id: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/locations/\(escapeSegment(id))")
	}

	// MARK: - Categories & Tags

	public func categories() async throws -> [CategoryDTO] {
		try await request(method: "GET", path: "/api/categories")
	}

	public func tags(owner: ID?) async throws -> [TagCountDTO] {
		let q = owner.map { [URLQueryItem(name: "owner", value: $0)] } ?? []
		return try await request(method: "GET", path: "/api/tags", queryItems: q)
	}

	// MARK: - Items

	public func items(_ query: ItemQuery) async throws -> ItemListDTO {
		try await request(method: "GET", path: "/api/items", queryItems: query.queryItems)
	}

	public func item(id: ID) async throws -> ItemDetailDTO {
		try await request(method: "GET", path: "/api/items/\(escapeSegment(id))")
	}

	public func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(
			method: "POST", path: "/api/items", bodyData: data, idempotencyKey: idempotencyKey
		)
	}

	public func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "PATCH", path: "/api/items/\(escapeSegment(id))", bodyData: data)
	}

	public func deleteItem(id: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/items/\(escapeSegment(id))")
	}

	public func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "POST", path: "/api/items/move", bodyData: data)
	}

	// MARK: - Analyses

	public func analyses(itemId: ID) async throws -> [AnalysisDTO] {
		try await request(method: "GET", path: "/api/items/\(escapeSegment(itemId))/analyses")
	}

	public func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] {
		let body = RunAnalysesRequest(kinds: kinds)
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "POST", path: "/api/items/\(escapeSegment(itemId))/analyses", bodyData: data)
	}

	public func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO {
		let body = ApplyAnalysisRequest(fields: fields)
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(
			method: "POST",
			path: "/api/items/\(escapeSegment(itemId))/analyses/\(escapeSegment(analysisId))/apply",
			bodyData: data
		)
	}

	// MARK: - Photos

	public func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(
			method: "POST", path: "/api/photos", bodyData: data, idempotencyKey: idempotencyKey
		)
	}

	public func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws {
		var request = URLRequest(url: url)
		request.httpMethod = "PUT"
		request.timeoutInterval = 120
		request.httpBody = data
		for (key, value) in headers {
			request.setValue(value, forHTTPHeaderField: key)
		}

		do {
			let (responseData, response) = try await s3Session.data(for: request)
			guard let httpResponse = response as? HTTPURLResponse else {
				throw APIError(status: 0, error: "network", message: "Invalid HTTP response from upload")
			}
			if (200...299).contains(httpResponse.statusCode) {
				return
			}
			if httpResponse.statusCode == 403 {
				throw APIError(status: 403, error: "upload_expired", message: "Photo upload URL expired")
			}
			let rawText = String(data: responseData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
			let message = (rawText?.isEmpty == false) ? rawText! : HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
			throw APIError(status: httpResponse.statusCode, error: "http_\(httpResponse.statusCode)", message: message)
		} catch let urlError as URLError {
			throw APIError(status: 0, error: "network", message: urlError.localizedDescription)
		} catch let apiError as APIError {
			throw apiError
		} catch is CancellationError {
			throw CancellationError()
		} catch {
			throw APIError(status: 0, error: "network", message: error.localizedDescription)
		}
	}

	public func completePhoto(id: ID) async throws -> PhotoDTO {
		try await request(method: "POST", path: "/api/photos/\(escapeSegment(id))/complete")
	}

	public func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "PATCH", path: "/api/photos/\(escapeSegment(id))", bodyData: data)
	}

	public func deletePhoto(id: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/photos/\(escapeSegment(id))")
	}

	public func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? {
		let (_, response) = try await send(
			method: "GET",
			path: "/api/photos/\(escapeSegment(id))/\(variant.rawValue)",
			isPhotoVariantRedirect: true
		)
		if response.statusCode == 404 {
			return nil
		}
		if (300...399).contains(response.statusCode) {
			guard let location = response.value(forHTTPHeaderField: "Location"),
				  let url = URL(string: location, relativeTo: baseURL)?.absoluteURL else {
				throw APIError(status: response.statusCode, error: "bad_response", message: "Missing or invalid Location header")
			}
			return url
		}
		if let location = response.value(forHTTPHeaderField: "Location"),
		   let url = URL(string: location, relativeTo: baseURL)?.absoluteURL {
			return url
		}
		throw APIError(status: response.statusCode, error: "bad_response", message: "Expected 302 redirect for photo variant")
	}

	// MARK: - Sessions

	public func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(
			method: "POST", path: "/api/sessions", bodyData: data, idempotencyKey: idempotencyKey
		)
	}

	public func session(id: ID) async throws -> PackingSessionDetailDTO {
		try await request(method: "GET", path: "/api/sessions/\(escapeSegment(id))")
	}

	public func endSession(id: ID) async throws -> PackingSessionDTO {
		try await request(method: "POST", path: "/api/sessions/\(escapeSegment(id))/end")
	}

	// MARK: - Sharing

	public func shares() async throws -> [ShareDTO] {
		try await request(method: "GET", path: "/api/shares")
	}

	public func createShare(_ body: CreateShareRequest) async throws -> ShareDTO {
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "POST", path: "/api/shares", bodyData: data)
	}

	public func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO {
		let body = UpdateShareRequest(access: access)
		let data = try JSONEncoder.wardrobe.encode(body)
		return try await request(method: "PATCH", path: "/api/shares/\(escapeSegment(id))", bodyData: data)
	}

	public func deleteShare(id: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/shares/\(escapeSegment(id))")
	}

	public func sharedWithMe() async throws -> [SharedWithMeDTO] {
		try await request(method: "GET", path: "/api/shared-with-me")
	}

	// MARK: - Outfits, Immich and suggestions
	public func outfits(_ query: OutfitQuery) async throws -> OutfitListDTO {
		return try await request(method: "GET", path: "/api/outfits", queryItems: query.queryItems)
	}
	public func sharedOutfits() async throws -> [OutfitSummaryDTO] {
		return try await request(method: "GET", path: "/api/outfits/shared-with-me")
	}
	public func outfit(id: ID) async throws -> OutfitDetailDTO {
		return try await request(method: "GET", path: "/api/outfits/\(escapeSegment(id))")
	}
	public func createOutfit(_ body: CreateOutfitRequest, idempotencyKey: String) async throws -> OutfitDetailDTO {
		return try await request(method: "POST", path: "/api/outfits", bodyData: try JSONEncoder.wardrobe.encode(body), idempotencyKey: idempotencyKey)
	}
	public func updateOutfit(id: ID, _ body: UpdateOutfitRequest) async throws -> OutfitDetailDTO {
		return try await request(method: "PATCH", path: "/api/outfits/\(escapeSegment(id))", bodyData: try JSONEncoder.wardrobe.encode(body))
	}
	public func deleteOutfit(id: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/outfits/\(escapeSegment(id))")
	}
	public func createOutfitShare(outfitId: ID, _ body: CreateOutfitShareRequest) async throws -> OutfitShareDTO {
		return try await request(method: "POST", path: "/api/outfits/\(escapeSegment(outfitId))/shares", bodyData: try JSONEncoder.wardrobe.encode(body))
	}
	public func deleteOutfitShare(outfitId: ID, shareId: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/outfits/\(escapeSegment(outfitId))/shares/\(escapeSegment(shareId))")
	}
	public func immichStatus() async throws -> ImmichStatusDTO {
		return try await request(method: "GET", path: "/api/immich")
	}
	public func connectImmich(_ body: ConnectImmichRequest) async throws -> ImmichStatusDTO {
		return try await request(method: "PUT", path: "/api/immich", bodyData: try JSONEncoder.wardrobe.encode(body))
	}
	public func disconnectImmich() async throws {
		try await requestVoid(method: "DELETE", path: "/api/immich")
	}
	public func immichAssets(_ query: ImmichAssetQuery) async throws -> ImmichAssetListDTO {
		return try await request(method: "GET", path: "/api/immich/assets", queryItems: query.queryItems)
	}
	public func linkImmichAssets(outfitId: ID, _ body: LinkImmichAssetsRequest) async throws -> [OutfitPhotoDTO] {
		return try await request(method: "POST", path: "/api/outfits/\(escapeSegment(outfitId))/immich-assets", bodyData: try JSONEncoder.wardrobe.encode(body))
	}
	public func unlinkImmichAsset(outfitId: ID, linkId: ID) async throws {
		try await requestVoid(method: "DELETE", path: "/api/outfits/\(escapeSegment(outfitId))/immich-assets/\(escapeSegment(linkId))")
	}
	public func suggestionRuns(owner: ID?) async throws -> [SuggestionRunDTO] {
		return try await request(method: "GET", path: "/api/suggestion-runs", queryItems: owner.map { [URLQueryItem(name: "owner", value: $0)] } ?? [])
	}
	public func suggestionRun(id: ID) async throws -> SuggestionRunDTO {
		return try await request(method: "GET", path: "/api/suggestion-runs/\(escapeSegment(id))")
	}
	public func createSuggestionRun(_ body: CreateSuggestionRunRequest, idempotencyKey: String) async throws -> SuggestionRunDTO {
		return try await request(method: "POST", path: "/api/suggestion-runs", bodyData: try JSONEncoder.wardrobe.encode(body), idempotencyKey: idempotencyKey)
	}
	public func dismissSuggestion(id: ID) async throws -> OutfitSuggestionDTO {
		return try await request(method: "POST", path: "/api/outfit-suggestions/\(escapeSegment(id))/dismiss")
	}
	public func queueBulkAnalyses(_ body: BulkItemsRequest) async throws -> BulkAnalysesDTO {
		return try await request(method: "POST", path: "/api/items/analyses", bodyData: try JSONEncoder.wardrobe.encode(body))
	}
	public func applyBulkTags(_ body: BulkApplyRequest) async throws -> BulkApplyTagsDTO {
		return try await request(method: "POST", path: "/api/items/analyses/apply-tags", bodyData: try JSONEncoder.wardrobe.encode(body))
	}

 public func immichThumbnail(assetId: ID) async throws -> Data? {
  try await imageBytes(path: "/api/immich/assets/\(escapeSegment(assetId))/thumb")
 }
 public func outfitImmichImage(outfitId: ID, linkId: ID, variant: PhotoVariant) async throws -> Data? {
  try await imageBytes(path: "/api/outfits/\(escapeSegment(outfitId))/immich-assets/\(escapeSegment(linkId))/\(escapeSegment(variant.rawValue))")
 }
 private func imageBytes(path: String) async throws -> Data? {
  do { return try await send(method: "GET", path: path).0 }
  catch let error as APIError where error.status == 404 { return nil }
 }

	// MARK: - Private Helpers

	private func escapeSegment(_ segment: String) -> String {
		let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
		return segment.addingPercentEncoding(withAllowedCharacters: allowed) ?? segment
	}

	private func request<T: Decodable>(
		method: String,
		path: String,
		queryItems: [URLQueryItem] = [],
		bodyData: Data? = nil,
		idempotencyKey: String? = nil
	) async throws -> T {
		let (data, response) = try await send(
			method: method,
			path: path,
			queryItems: queryItems,
			bodyData: bodyData,
			idempotencyKey: idempotencyKey
		)
		do {
			return try JSONDecoder.wardrobe.decode(T.self, from: data)
		} catch {
			throw APIError(status: response.statusCode, error: "decoding", message: error.localizedDescription)
		}
	}

	private func requestVoid(
		method: String,
		path: String,
		queryItems: [URLQueryItem] = [],
		bodyData: Data? = nil
	) async throws {
		_ = try await send(
			method: method,
			path: path,
			queryItems: queryItems,
			bodyData: bodyData
		)
	}

	private func send(
		method: String,
		path: String,
		queryItems: [URLQueryItem] = [],
		bodyData: Data? = nil,
		idempotencyKey: String? = nil,
		requiresAuth: Bool = true,
		isPhotoVariantRedirect: Bool = false
	) async throws -> (Data, HTTPURLResponse) {
		var token: String? = nil
		if requiresAuth {
			token = try await tokens.validToken()
		}

		let (data, response) = try await performRequest(
			method: method,
			path: path,
			queryItems: queryItems,
			bodyData: bodyData,
			idempotencyKey: idempotencyKey,
			token: token
		)

		if requiresAuth, let currentToken = token, isAuthFailure(response: response, data: data, isPhotoVariantRedirect: isPhotoVariantRedirect) {
			let newToken: String
			do {
				newToken = try await tokens.refreshAfterRejection(of: currentToken)
			} catch let apiError as APIError {
				throw apiError
			} catch {
				throw APIError.signedOut
			}

			let (retryData, retryResponse) = try await performRequest(
				method: method,
				path: path,
				queryItems: queryItems,
				bodyData: bodyData,
				idempotencyKey: idempotencyKey,
				token: newToken
			)

			if isAuthFailure(response: retryResponse, data: retryData, isPhotoVariantRedirect: isPhotoVariantRedirect) {
				throw APIError.signedOut
			}

			try validateResponse(response: retryResponse, data: retryData, isPhotoVariantRedirect: isPhotoVariantRedirect)
			return (retryData, retryResponse)
		}

		try validateResponse(response: response, data: data, isPhotoVariantRedirect: isPhotoVariantRedirect)
		return (data, response)
	}

	private func performRequest(
		method: String,
		path: String,
		queryItems: [URLQueryItem],
		bodyData: Data?,
		idempotencyKey: String?,
		token: String?
	) async throws -> (Data, HTTPURLResponse) {
		var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: true)
		let basePath = baseURL.path.hasSuffix("/") ? String(baseURL.path.dropLast()) : baseURL.path
		let cleanPath = path.hasPrefix("/") ? path : "/" + path
		components?.percentEncodedPath = basePath + cleanPath
		if !queryItems.isEmpty {
			components?.queryItems = queryItems
		}
		guard let url = components?.url else {
			throw APIError(status: 0, error: "bad_url", message: "Failed to construct URL for \(path)")
		}

		var request = URLRequest(url: url)
		request.httpMethod = method
		request.timeoutInterval = 30
		request.setValue("application/json", forHTTPHeaderField: "Accept")
		request.setValue(userAgent, forHTTPHeaderField: "User-Agent")

		if let token {
			request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
		}
		if let idempotencyKey {
			request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
		}
		if let bodyData {
			request.setValue("application/json", forHTTPHeaderField: "Content-Type")
			request.httpBody = bodyData
		}

		do {
			let (data, response) = try await apiSession.data(for: request)
			guard let httpResponse = response as? HTTPURLResponse else {
				throw APIError(status: 0, error: "network", message: "Invalid HTTP response")
			}
			return (data, httpResponse)
		} catch let urlError as URLError {
			throw APIError(status: 0, error: "network", message: urlError.localizedDescription)
		} catch let apiError as APIError {
			throw apiError
		} catch is CancellationError {
			throw CancellationError()
		} catch {
			throw APIError(status: 0, error: "network", message: error.localizedDescription)
		}
	}

	private func isAuthFailure(response: HTTPURLResponse, data: Data, isPhotoVariantRedirect: Bool) -> Bool {
		let statusCode = response.statusCode
		if statusCode == 401 {
			return true
		}
		if (300...399).contains(statusCode) && !isPhotoVariantRedirect {
			return true
		}
		if statusCode == 403 {
			if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data), !body.error.isEmpty {
				return false
			}
			return true
		}
		return false
	}

	private func validateResponse(response: HTTPURLResponse, data: Data, isPhotoVariantRedirect: Bool) throws {
		let statusCode = response.statusCode
		if (200...299).contains(statusCode) {
			return
		}
		if isPhotoVariantRedirect && ((300...399).contains(statusCode) || statusCode == 404) {
			return
		}

		let retryAfter = RetryAfterParser.parse(response.value(forHTTPHeaderField: "Retry-After"))

		if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data), !body.error.isEmpty {
			throw APIError(status: statusCode, error: body.error, message: body.message, retryAfter: retryAfter)
		}

		let rawText = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
		let message = (rawText?.isEmpty == false) ? rawText! : HTTPURLResponse.localizedString(forStatusCode: statusCode)
		throw APIError(status: statusCode, error: "http_\(statusCode)", message: message, retryAfter: retryAfter)
	}
}

private final class RedirectStopDelegate: NSObject, URLSessionTaskDelegate, Sendable {
	func urlSession(
		_ session: URLSession,
		task: URLSessionTask,
		willPerformHTTPRedirection response: HTTPURLResponse,
		newRequest request: URLRequest,
		completionHandler: @escaping @Sendable (URLRequest?) -> Void
	) {
		completionHandler(nil)
	}
}

/// A fixed token: for `AUTH_MODE=dev` servers (which ignore it) and tests.
public struct StaticTokenProvider: TokenProvider {
	public let token: String
	public init(token: String = "dev") { self.token = token }
	public func validToken() async throws -> String { token }
	public func refreshAfterRejection(of rejected: String) async throws -> String { throw APIError.signedOut }
}
