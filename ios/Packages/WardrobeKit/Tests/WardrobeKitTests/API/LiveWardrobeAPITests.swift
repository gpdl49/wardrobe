import Foundation
import Testing
@testable import WardrobeKit

final class MockURLProtocol: URLProtocol, @unchecked Sendable {
	nonisolated(unsafe) static var handler: (@Sendable (URLRequest) throws -> (HTTPURLResponse, Data))?
	nonisolated(unsafe) static var recordedRequests: [(request: URLRequest, body: Data?)] = []

	override class func canInit(with request: URLRequest) -> Bool {
		true
	}

	override class func canonicalRequest(for request: URLRequest) -> URLRequest {
		request
	}

	override func startLoading() {
		let body = Self.extractBody(from: request)
		Self.recordedRequests.append((request: request, body: body))

		guard let handler = Self.handler else {
			client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
			return
		}

		do {
			let (response, data) = try handler(request)
			if (300...399).contains(response.statusCode),
			   let loc = response.value(forHTTPHeaderField: "Location"),
			   let redirectURL = URL(string: loc) {
				let redirectReq = URLRequest(url: redirectURL)
				client?.urlProtocol(self, wasRedirectedTo: redirectReq, redirectResponse: response)
			}
			client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
			client?.urlProtocol(self, didLoad: data)
			client?.urlProtocolDidFinishLoading(self)
		} catch {
			client?.urlProtocol(self, didFailWithError: error)
		}
	}

	override func stopLoading() {}

	static func extractBody(from request: URLRequest) -> Data? {
		if let data = request.httpBody {
			return data
		}
		guard let stream = request.httpBodyStream else { return nil }
		stream.open()
		defer { stream.close() }
		var buffer = [UInt8](repeating: 0, count: 4096)
		var data = Data()
		while stream.hasBytesAvailable {
			let read = stream.read(&buffer, maxLength: buffer.count)
			if read > 0 {
				data.append(buffer, count: read)
			} else {
				break
			}
		}
		return data.isEmpty ? nil : data
	}

	static func reset() {
		handler = nil
		recordedRequests.removeAll()
	}
}

final class Counter: @unchecked Sendable {
	private let lock = NSLock()
	private var _value: Int

	init(_ value: Int = 0) {
		self._value = value
	}

	var value: Int {
		lock.lock()
		defer { lock.unlock() }
		return _value
	}

	@discardableResult
	func increment() -> Int {
		lock.lock()
		defer { lock.unlock() }
		_value += 1
		return _value
	}
}

final class MockTokenProvider: TokenProvider, @unchecked Sendable {
	var token: String = "token-1"
	var refreshResult: String = "token-2"
	var refreshCallCount = 0
	var rejectedTokens: [String] = []
	var shouldFailRefresh = false

	init(token: String = "token-1", refreshResult: String = "token-2") {
		self.token = token
		self.refreshResult = refreshResult
	}

	func validToken() async throws -> String {
		token
	}

	func refreshAfterRejection(of rejected: String) async throws -> String {
		refreshCallCount += 1
		rejectedTokens.append(rejected)
		if shouldFailRefresh {
			throw APIError.signedOut
		}
		token = refreshResult
		return refreshResult
	}
}

@Suite("LiveWardrobeAPI Tests", .serialized)
struct LiveWardrobeAPITests {
	let baseURL = URL(string: "https://wardrobe.vidur.xyz")!
	let now = Date(timeIntervalSince1970: 1_763_200_000)

	func makeAPI(tokens: any TokenProvider) -> LiveWardrobeAPI {
		let config = URLSessionConfiguration.ephemeral
		config.protocolClasses = [MockURLProtocol.self]
		return LiveWardrobeAPI(baseURL: baseURL, tokens: tokens, configuration: config)
	}

	func jsonRaw(
		_ json: String,
		status: Int = 200,
		headers: [String: String] = [:]
	) -> (HTTPURLResponse, Data) {
		var allHeaders = headers
		if allHeaders["Content-Type"] == nil {
			allHeaders["Content-Type"] = "application/json"
		}
		let resp = HTTPURLResponse(
			url: baseURL,
			statusCode: status,
			httpVersion: "HTTP/1.1",
			headerFields: allHeaders
		)!
		return (resp, Data(json.utf8))
	}

	func jsonDTO<T: Encodable>(
		_ value: T,
		status: Int = 200,
		headers: [String: String] = [:]
	) -> (HTTPURLResponse, Data) {
		let data = (try? JSONEncoder.wardrobe.encode(value)) ?? Data()
		var allHeaders = headers
		if allHeaders["Content-Type"] == nil {
			allHeaders["Content-Type"] = "application/json"
		}
		let resp = HTTPURLResponse(
			url: baseURL,
			statusCode: status,
			httpVersion: "HTTP/1.1",
			headerFields: allHeaders
		)!
		return (resp, data)
	}

	func samplePhoto(id: String = "p1", status: PhotoStatus = .pending) -> PhotoDTO {
		PhotoDTO(
			id: id, ownerId: "u1", access: .owner, itemId: nil,
			kind: .main, status: status, contentType: "image/jpeg",
			size: 100, createdAt: now
		)
	}

	func sampleItem(id: String = "i1") -> ItemDetailDTO {
		ItemDetailDTO(
			id: id, ownerId: "u1", access: .owner, name: "T-Shirt",
			colors: [], seasons: [], status: .active, tags: [],
			createdAt: now, updatedAt: now, photos: [], movements: [],
			analyses: []
		)
	}

	// MARK: - Auth Failure & Retry

	@Test func authFailure401RefreshesAndRetries() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "old-token", refreshResult: "new-token")
		let api = makeAPI(tokens: tokens)

		let callCounter = Counter()
		MockURLProtocol.handler = { req in
			let count = callCounter.increment()
			if count == 1 {
				#expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer old-token")
				return self.jsonRaw(#"{"error":"unauthorized","message":"expired"}"#, status: 401)
			} else {
				#expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer new-token")
				let me = MeDTO(
					id: "u1", sub: "sub1", email: "u@example.com", username: "u",
					groups: ["wardrobe"], isAdmin: false
				)
				return self.jsonDTO(me)
			}
		}

		let me = try await api.me()
		#expect(me.id == "u1")
		#expect(tokens.refreshCallCount == 1)
		#expect(tokens.rejectedTokens == ["old-token"])
		#expect(callCounter.value == 2)
	}

	@Test func postRetryKeepsIdenticalBodyAndKey() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "old", refreshResult: "new")
		let api = makeAPI(tokens: tokens)
		let calls = Counter()
		MockURLProtocol.handler = { _ in
			if calls.increment() == 1 { return self.jsonRaw("{}", status: 401) }
			return self.jsonDTO(ItemSummaryDTO(id: "item", ownerId: "owner", access: .owner, name: "Coat", createdAt: .now, updatedAt: .now))
		}
		let key = UUID().uuidString
		_ = try await api.createItem(CreateItemRequest(name: "Coat", tags: ["wool", "winter"]), idempotencyKey: key)
		let requests = MockURLProtocol.recordedRequests
		#expect(requests.count == 2)
		#expect(requests[0].body != nil)
		#expect(requests[0].body == requests[1].body)
		#expect(requests[0].request.value(forHTTPHeaderField: "Idempotency-Key") == key)
		#expect(requests[1].request.value(forHTTPHeaderField: "Idempotency-Key") == key)
		#expect(tokens.refreshCallCount == 1)
	}

	@Test func second401ThrowsSignedOut() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "tok-1", refreshResult: "tok-2")
		let api = makeAPI(tokens: tokens)

		MockURLProtocol.handler = { _ in
			self.jsonRaw(#"{"error":"unauthorized","message":"still invalid"}"#, status: 401)
		}

		await #expect(throws: APIError.self) {
			try await api.me()
		}

		do {
			_ = try await api.me()
		} catch let error as APIError {
			#expect(error.error == "signed_out")
			#expect(error.status == 401)
		} catch {
			Issue.record("Expected APIError.signedOut, got \(error)")
		}
	}

	@Test func authFailureWhenRefreshFailsThrowsSignedOut() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "tok-1")
		tokens.shouldFailRefresh = true
		let api = makeAPI(tokens: tokens)

		MockURLProtocol.handler = { _ in
			self.jsonRaw(#"{"error":"unauthorized","message":"expired"}"#, status: 401)
		}

		do {
			_ = try await api.me()
			Issue.record("Expected me() to throw signedOut")
		} catch let error as APIError {
			#expect(error.status == 401)
			#expect(error.error == "signed_out")
		}
	}

	@Test func userAgentHeaderFormat() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			let ua = req.value(forHTTPHeaderField: "User-Agent") ?? ""
			#expect(ua.starts(with: "Wardrobe-iOS/"))
			#expect(ua.contains("iOS"))
			return self.jsonDTO([CategoryDTO]())
		}

		_ = try await api.categories()
	}

	@Test func transportErrorThrowsStatus0Network() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { _ in
			throw URLError(.notConnectedToInternet)
		}

		do {
			_ = try await api.categories()
			Issue.record("Expected network failure to throw")
		} catch let error as APIError {
			#expect(error.status == 0)
			#expect(error.error == "network")
			#expect(error.isRetryable == true)
		}
	}

	@Test func photoURLRelativeLocationResolvesAgainstBaseURL() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { _ in
			let resp = HTTPURLResponse(
				url: self.baseURL,
				statusCode: 302,
				httpVersion: "HTTP/1.1",
				headerFields: ["Location": "/local/photos/p1/display.jpg"]
			)!
			return (resp, Data())
		}

		let url = try await api.photoURL(id: "p1", variant: .display)
		#expect(url?.absoluteString == "https://wardrobe.vidur.xyz/local/photos/p1/display.jpg")
	}

	@Test func forbidden403WithJSONIsNotRetried() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider()
		let api = makeAPI(tokens: tokens)

		MockURLProtocol.handler = { _ in
			self.jsonRaw(#"{"error":"forbidden","message":"view only"}"#, status: 403)
		}

		do {
			_ = try await api.createLocation(CreateLocationRequest(kind: .closet, code: "CL-1", name: "Closet 1"))
			Issue.record("Expected 403 to throw")
		} catch let error as APIError {
			#expect(error.status == 403)
			#expect(error.error == "forbidden")
			#expect(error.message == "view only")
			#expect(tokens.refreshCallCount == 0) // Never retried
		}
	}

	@Test func forbidden403NonJSONIsRetriedAsAuthFailure() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "tok-old", refreshResult: "tok-new")
		let api = makeAPI(tokens: tokens)

		let callCounter = Counter()
		MockURLProtocol.handler = { req in
			let count = callCounter.increment()
			if count == 1 {
				let resp = HTTPURLResponse(
					url: self.baseURL,
					statusCode: 403,
					httpVersion: "HTTP/1.1",
					headerFields: ["Content-Type": "text/html"]
				)!
				return (resp, Data("<html>Forbidden by oauth2-proxy</html>".utf8))
			} else {
				#expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer tok-new")
				let me = MeDTO(
					id: "u1", sub: "sub1", email: "u@example.com", username: "u",
					groups: ["wardrobe"], isAdmin: false
				)
				return self.jsonDTO(me)
			}
		}

		let me = try await api.me()
		#expect(me.id == "u1")
		#expect(tokens.refreshCallCount == 1)
		#expect(callCounter.value == 2)
	}

	@Test func redirect302OnJSONEndpointIsRetriedAsAuthFailure() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "tok-old", refreshResult: "tok-new")
		let api = makeAPI(tokens: tokens)

		let callCounter = Counter()
		MockURLProtocol.handler = { req in
			let count = callCounter.increment()
			if count == 1 {
				let resp = HTTPURLResponse(
					url: self.baseURL,
					statusCode: 302,
					httpVersion: "HTTP/1.1",
					headerFields: ["Location": "https://z.vidur.xyz/oauth/v2/authorize"]
				)!
				return (resp, Data())
			} else {
				#expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer tok-new")
				return self.jsonDTO(ItemListDTO(items: [], nextCursor: nil))
			}
		}

		let list = try await api.items(ItemQuery())
		#expect(list.items.isEmpty)
		#expect(tokens.refreshCallCount == 1)
		#expect(callCounter.value == 2)
	}

	// MARK: - Photos & S3

	@Test func photoURLStopsRedirectAndReturnsLocation() async throws {
		MockURLProtocol.reset()
		let tokens = MockTokenProvider(token: "tok")
		let api = makeAPI(tokens: tokens)

		MockURLProtocol.handler = { req in
			#expect(req.url?.path == "/api/photos/photo-1/thumb")
			#expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
			let resp = HTTPURLResponse(
				url: self.baseURL,
				statusCode: 302,
				httpVersion: "HTTP/1.1",
				headerFields: ["Location": "https://s3.example.com/photos/photo-1-thumb.jpg"]
			)!
			return (resp, Data())
		}

		let url = try await api.photoURL(id: "photo-1", variant: .thumb)
		#expect(url?.absoluteString == "https://s3.example.com/photos/photo-1-thumb.jpg")
		#expect(tokens.refreshCallCount == 0) // 302 on photo variant is NOT treated as auth failure!
	}

	@Test func photoURL404ReturnsNil() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { _ in
			self.jsonRaw(#"{"error":"not_found","message":"Not ready"}"#, status: 404)
		}

		let url = try await api.photoURL(id: "p1", variant: .display)
		#expect(url == nil)
	}

	@Test func uploadPhotoSendsPUTWithExactHeadersAndNoAuth() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider(token: "secret-token"))

		MockURLProtocol.handler = { req in
			#expect(req.httpMethod == "PUT")
			#expect(req.value(forHTTPHeaderField: "Authorization") == nil)
			#expect(req.value(forHTTPHeaderField: "Content-Type") == "image/jpeg")
			#expect(req.value(forHTTPHeaderField: "x-amz-meta-custom") == "value")
			#expect(req.timeoutInterval == 120)
			let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:])!
			return (resp, Data())
		}

		let s3URL = URL(string: "https://s3.example.com/upload/photo.jpg?signed=1")!
		let bytes = Data([0xDE, 0xAD, 0xBE, 0xEF])
		try await api.uploadPhoto(bytes, to: s3URL, headers: [
			"Content-Type": "image/jpeg",
			"x-amz-meta-custom": "value"
		])

		#expect(MockURLProtocol.recordedRequests.count == 1)
		#expect(MockURLProtocol.recordedRequests[0].body == bytes)
	}

	@Test func uploadPhotoS3403ThrowsUploadExpired() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			let resp = HTTPURLResponse(url: req.url!, statusCode: 403, httpVersion: "HTTP/1.1", headerFields: [:])!
			return (resp, Data("<Error><Code>AccessDenied</Code></Error>".utf8))
		}

		do {
			try await api.uploadPhoto(Data([1, 2]), to: URL(string: "https://s3.example.com/p.jpg")!, headers: [:])
			Issue.record("Expected uploadPhoto to throw")
		} catch let error as APIError {
			#expect(error.status == 403)
			#expect(error.error == "upload_expired")
		}
	}

	@Test func uploadPhotoOtherErrorThrowsHttpStatus() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			let resp = HTTPURLResponse(url: req.url!, statusCode: 500, httpVersion: "HTTP/1.1", headerFields: [:])!
			return (resp, Data("Internal S3 Error".utf8))
		}

		do {
			try await api.uploadPhoto(Data([1, 2]), to: URL(string: "https://s3.example.com/p.jpg")!, headers: [:])
			Issue.record("Expected uploadPhoto to throw")
		} catch let error as APIError {
			#expect(error.status == 500)
			#expect(error.error == "http_500")
			#expect(error.message == "Internal S3 Error")
		}
	}

	// MARK: - Health

	@Test func healthSendsNoAuthAndReturnsTrueOn200() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider(token: "should-not-send"))

		MockURLProtocol.handler = { req in
			#expect(req.url?.path == "/api/healthz")
			#expect(req.value(forHTTPHeaderField: "Authorization") == nil)
			let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:])!
			return (resp, Data("ok".utf8))
		}

		let ok = try await api.health()
		#expect(ok == true)
	}

	// MARK: - Idempotency Keys

	@Test func idempotencyKeyPresence() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			if req.url?.path == "/api/items" {
				#expect(req.value(forHTTPHeaderField: "Idempotency-Key") == "item-key-123")
				let item = ItemSummaryDTO(
					id: "i1", ownerId: "u1", access: .owner, name: "Jacket",
					createdAt: self.now, updatedAt: self.now
				)
				return self.jsonDTO(item, status: 201)
			}
			if req.url?.path == "/api/photos" {
				#expect(req.value(forHTTPHeaderField: "Idempotency-Key") == "photo-key-456")
				let p = self.samplePhoto(id: "p1")
				let upload = PhotoUploadDTO(photo: p, uploadUrl: URL(string: "https://s3.example/u")!, uploadHeaders: [:])
				return self.jsonDTO(upload, status: 201)
			}
			if req.url?.path == "/api/sessions" {
				#expect(req.value(forHTTPHeaderField: "Idempotency-Key") == "sess-key-789")
				let sess = PackingSessionDTO(
					id: "s1", ownerId: "u1", access: .owner, mode: .pack,
					locationId: "l1", startedAt: self.now, endedAt: nil
				)
				return self.jsonDTO(sess, status: 201)
			}
			if req.url?.path == "/api/locations" {
				#expect(req.value(forHTTPHeaderField: "Idempotency-Key") == nil)
				let loc = LocationDTO(
					id: "l1", ownerId: "u1", access: .owner, kind: .closet,
					code: "BED", name: "Bedroom", createdAt: self.now,
					updatedAt: self.now, itemCount: 0
				)
				return self.jsonDTO(loc)
			}
			return self.jsonRaw("{}", status: 200)
		}

		_ = try await api.createItem(CreateItemRequest(name: "Jacket"), idempotencyKey: "item-key-123")
		_ = try await api.createPhoto(CreatePhotoRequest(itemId: nil, kind: .main, size: 100), idempotencyKey: "photo-key-456")
		_ = try await api.createSession(CreateSessionRequest(mode: .pack, locationId: "l1"), idempotencyKey: "sess-key-789")
		_ = try await api.createLocation(CreateLocationRequest(kind: .closet, code: "BED", name: "Bedroom"))
	}

	// MARK: - Paths, Query, and Segment Encoding

	@Test func pathSegmentEncodingAndQueries() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			let full = req.url?.absoluteString ?? ""
			if full.contains("/by-code/") {
				#expect(full == "https://wardrobe.vidur.xyz/api/locations/by-code/B%2007%2Fx?owner=u-anna")
				let loc = LocationDTO(
					id: "l1", ownerId: "u-anna", access: .view, kind: .bag,
					code: "B 07/x", name: "Box", createdAt: self.now,
					updatedAt: self.now, itemCount: 0
				)
				return self.jsonDTO(loc)
			}
			if full.contains("/api/tags") {
				#expect(full == "https://wardrobe.vidur.xyz/api/tags?owner=u-anna")
				return self.jsonDTO([TagCountDTO(name: "wool", count: 3)])
			}
			if full.contains("/api/items?") {
				#expect(full == "https://wardrobe.vidur.xyz/api/items?location=loc-1&season=winter&q=red%20coat&limit=48")
				return self.jsonDTO(ItemListDTO(items: [], nextCursor: nil))
			}
			return self.jsonDTO([String]())
		}

		_ = try await api.location(code: "B 07/x", owner: "u-anna")
		_ = try await api.tags(owner: "u-anna")
		_ = try await api.items(ItemQuery(location: "loc-1", season: .winter, q: "red coat", limit: 48))
	}

	// MARK: - PATCH Null and Move Null Encoding

	@Test func patchNullEncodingSentToServer() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			if req.url?.path == "/api/items/item-1" {
				#expect(req.httpMethod == "PATCH")
				let bodyStr = String(decoding: MockURLProtocol.extractBody(from: req) ?? Data(), as: UTF8.self)
				#expect(bodyStr == #"{"locationId":null,"name":"Shirt"}"#)
				let item = ItemSummaryDTO(
					id: "item-1", ownerId: "u1", access: .owner, name: "Shirt",
					createdAt: self.now, updatedAt: self.now
				)
				return self.jsonDTO(item)
			}
			if req.url?.path == "/api/items/move" {
				#expect(req.httpMethod == "POST")
				let bodyStr = String(decoding: MockURLProtocol.extractBody(from: req) ?? Data(), as: UTF8.self)
				#expect(bodyStr == #"{"itemIds":["i1","i2"],"toLocationId":null}"#)
				return self.jsonRaw(#"{"moved":2}"#)
			}
			return self.jsonRaw("{}", status: 200)
		}

		var updateReq = UpdateItemRequest()
		updateReq.name = .value("Shirt")
		updateReq.locationId = .null
		_ = try await api.updateItem(id: "item-1", updateReq)

		let moveRes = try await api.moveItems(MoveItemsRequest(itemIds: ["i1", "i2"], toLocationId: nil))
		#expect(moveRes.moved == 2)
	}

	// MARK: - Error Decoding & Retry-After

	@Test func errorDecodingContractJSON() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { _ in
			self.jsonRaw(
				#"{"error":"conflict","message":"Location still holds items"}"#,
				status: 409,
				headers: ["Retry-After": "45"]
			)
		}

		do {
			try await api.deleteLocation(id: "loc-1")
			Issue.record("Expected deleteLocation to throw")
		} catch let error as APIError {
			#expect(error.status == 409)
			#expect(error.error == "conflict")
			#expect(error.message == "Location still holds items")
			#expect(error.retryAfter == 45)
			#expect(error.isRetryable == false)
		}
	}

	@Test func errorDecodingNonJSONFallback() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { _ in
			let resp = HTTPURLResponse(
				url: self.baseURL,
				statusCode: 502,
				httpVersion: "HTTP/1.1",
				headerFields: ["Content-Type": "text/plain"]
			)!
			return (resp, Data("Bad Gateway from proxy".utf8))
		}

		do {
			_ = try await api.categories()
			Issue.record("Expected categories to throw")
		} catch let error as APIError {
			#expect(error.status == 502)
			#expect(error.error == "http_502")
			#expect(error.message == "Bad Gateway from proxy")
			#expect(error.isRetryable == true)
		}
	}

	@Test func decodingFailureThrowsDecodingError() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { _ in
			self.jsonRaw(#"{"unexpected_shape":true}"#, status: 200)
		}

		do {
			_ = try await api.me()
			Issue.record("Expected me to throw decoding error")
		} catch let error as APIError {
			#expect(error.status == 200)
			#expect(error.error == "decoding")
		}
	}

	@Test func retryAfterParserValues() {
		#expect(RetryAfterParser.parse("120") == 120)
		#expect(RetryAfterParser.parse("  0  ") == 0)
		#expect(RetryAfterParser.parse(nil) == nil)
		#expect(RetryAfterParser.parse("") == nil)
		#expect(RetryAfterParser.parse("-5") == nil)

		let date = Date(timeIntervalSinceNow: 60)
		let df = DateFormatter()
		df.locale = Locale(identifier: "en_US_POSIX")
		df.timeZone = TimeZone(secondsFromGMT: 0)
		df.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
		let str = df.string(from: date)
		let parsed = RetryAfterParser.parse(str, now: Date())
		#expect(parsed != nil)
		if let parsed {
			#expect(parsed >= 58 && parsed <= 62)
		}
	}

	// MARK: - Every Endpoint Smoke Coverage

	@Test func smokeCoverageForRemainingEndpoints() async throws {
		MockURLProtocol.reset()
		let api = makeAPI(tokens: StaticTokenProvider())

		MockURLProtocol.handler = { req in
			let p = req.url?.path ?? ""
			let m = req.httpMethod ?? ""

			if p == "/api/locations" && m == "GET" {
				return self.jsonDTO([LocationDTO]())
			}
			if p == "/api/locations/l1" && m == "GET" {
				let loc = LocationDetailDTO(
					id: "l1", ownerId: "u1", access: .owner, kind: .closet, code: "B1", name: "Box 1",
					createdAt: self.now, updatedAt: self.now, itemCount: 0, items: [], children: []
				)
				return self.jsonDTO(loc)
			}
			if p == "/api/items/i1" && m == "GET" {
				return self.jsonDTO(self.sampleItem(id: "i1"))
			}
			if p == "/api/items/i1" && m == "DELETE" {
				let resp = HTTPURLResponse(url: req.url!, statusCode: 204, httpVersion: "HTTP/1.1", headerFields: [:])!
				return (resp, Data())
			}
			if p == "/api/items/i1/analyses" && m == "GET" {
				return self.jsonDTO([AnalysisDTO]())
			}
			if p == "/api/items/i1/analyses" && m == "POST" {
				return self.jsonDTO([AnalysisDTO](), status: 202)
			}
			if p == "/api/items/i1/analyses/an1/apply" && m == "POST" {
				return self.jsonDTO(self.sampleItem(id: "i1"))
			}
			if p == "/api/photos/p1/complete" && m == "POST" {
				return self.jsonDTO(self.samplePhoto(id: "p1", status: .processing))
			}
			if p == "/api/photos/p1" && m == "PATCH" {
				return self.jsonDTO(self.samplePhoto(id: "p1", status: .ready))
			}
			if p == "/api/photos/p1" && m == "DELETE" {
				let resp = HTTPURLResponse(url: req.url!, statusCode: 204, httpVersion: "HTTP/1.1", headerFields: [:])!
				return (resp, Data())
			}
			if p == "/api/sessions/s1" && m == "GET" {
				let sess = PackingSessionDetailDTO(
					id: "s1", ownerId: "u1", access: .owner, mode: .pack, locationId: "l1",
					startedAt: self.now, endedAt: nil,
					location: LocationRef(id: "l1", kind: .closet, code: "B1", name: "Box 1"), items: []
				)
				return self.jsonDTO(sess)
			}
			if p == "/api/sessions/s1/end" && m == "POST" {
				let sess = PackingSessionDTO(
					id: "s1", ownerId: "u1", access: .owner, mode: .pack,
					locationId: "l1", startedAt: self.now, endedAt: self.now
				)
				return self.jsonDTO(sess)
			}
			if p == "/api/shares" && m == "GET" {
				return self.jsonDTO([ShareDTO]())
			}
			if p == "/api/shares" && m == "POST" {
				let sh = ShareDTO(
					id: "sh1", ownerId: "u1",
					grantee: UserRef(id: "u2", email: "anna@example.com", username: "anna"),
					access: .view, location: nil, createdAt: self.now, updatedAt: self.now
				)
				return self.jsonDTO(sh)
			}
			if p == "/api/shares/sh1" && m == "PATCH" {
				let sh = ShareDTO(
					id: "sh1", ownerId: "u1",
					grantee: UserRef(id: "u2", email: "anna@example.com", username: "anna"),
					access: .edit, location: nil, createdAt: self.now, updatedAt: self.now
				)
				return self.jsonDTO(sh)
			}
			if p == "/api/shares/sh1" && m == "DELETE" {
				let resp = HTTPURLResponse(url: req.url!, statusCode: 204, httpVersion: "HTTP/1.1", headerFields: [:])!
				return (resp, Data())
			}
			if p == "/api/shared-with-me" && m == "GET" {
				return self.jsonDTO([SharedWithMeDTO]())
			}

			return self.jsonRaw("{}", status: 200)
		}

		_ = try await api.locations(LocationQuery())
		_ = try await api.location(id: "l1")
		_ = try await api.item(id: "i1")
		try await api.deleteItem(id: "i1")
		_ = try await api.analyses(itemId: "i1")
		_ = try await api.runAnalyses(itemId: "i1", kinds: [.colors])
		_ = try await api.applyAnalysis(itemId: "i1", analysisId: "an1", fields: [.brand, .colors])
		_ = try await api.completePhoto(id: "p1")
		_ = try await api.updatePhoto(id: "p1", UpdatePhotoRequest(kind: .detail))
		try await api.deletePhoto(id: "p1")
		_ = try await api.session(id: "s1")
		_ = try await api.endSession(id: "s1")
		_ = try await api.shares()
		_ = try await api.createShare(CreateShareRequest(grantee: "anna@example.com", access: .view))
		_ = try await api.updateShare(id: "sh1", access: .edit)
		try await api.deleteShare(id: "sh1")
		_ = try await api.sharedWithMe()
	}
}
