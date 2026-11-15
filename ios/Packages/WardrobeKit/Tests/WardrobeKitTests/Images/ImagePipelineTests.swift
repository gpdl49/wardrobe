import Foundation
import Testing
@testable import WardrobeKit
import WardrobeKitTesting

private final class TestURLProtocol: URLProtocol, @unchecked Sendable {
	static let handlerLock = NSLock()
	nonisolated(unsafe) static var requestHandler: (@Sendable (URLRequest) throws -> (HTTPURLResponse, Data))?

	override class func canInit(with request: URLRequest) -> Bool { true }
	override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

	override func startLoading() {
		let handler = TestURLProtocol.handlerLock.withLock {
			TestURLProtocol.requestHandler
		}

		guard let handler else {
			client?.urlProtocol(self, didFailWithError: URLError(.unknown))
			return
		}

		do {
			let (response, data) = try handler(request)
			client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
			client?.urlProtocol(self, didLoad: data)
			client?.urlProtocolDidFinishLoading(self)
		} catch {
			client?.urlProtocol(self, didFailWithError: error)
		}
	}

	override func stopLoading() {}
}

private actor ScriptedPhotoAPI: WardrobeAPI {
	var photoURLCalls = 0
	var returnURL: URL?
	var urlsToReturn: [URL?] = []

	init(returnURL: URL?) {
		self.returnURL = returnURL
	}

	func setReturnURL(_ url: URL?) {
		self.returnURL = url
	}

	func setURLsToReturn(_ urls: [URL?]) {
		self.urlsToReturn = urls
	}

	func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? {
		photoURLCalls += 1
		if !urlsToReturn.isEmpty {
			return urlsToReturn.removeFirst()
		}
		return returnURL
	}

	// Unused endpoints for ImagePipeline
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
	func items(_ query: ItemQuery) async throws -> ItemListDTO { ItemListDTO(items: [], nextCursor: nil) }
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
	func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO { throw APIError(status: 500, error: "unused", message: "") }
	func session(id: ID) async throws -> PackingSessionDetailDTO { throw APIError(status: 500, error: "unused", message: "") }
	func endSession(id: ID) async throws -> PackingSessionDTO { throw APIError(status: 500, error: "unused", message: "") }
	func shares() async throws -> [ShareDTO] { [] }
	func createShare(_ body: CreateShareRequest) async throws -> ShareDTO { throw APIError(status: 500, error: "unused", message: "") }
	func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO { throw APIError(status: 500, error: "unused", message: "") }
	func deleteShare(id: ID) async throws {}
	func sharedWithMe() async throws -> [SharedWithMeDTO] { [] }
}

@Suite(.serialized) struct ImagePipelineTests {
	private func makeSession() -> URLSession {
		let config = URLSessionConfiguration.ephemeral
		config.protocolClasses = [TestURLProtocol.self]
		return URLSession(configuration: config)
	}

	private func makeTempDir() -> URL {
		let dir = URL.temporaryDirectory.appending(path: "pipeline-test-\(UUID().uuidString)")
		try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
		return dir
	}

	@Test func returnsNilWhenPhotoNotReady() async throws {
		let api = ScriptedPhotoAPI(returnURL: nil)
		let dir = makeTempDir()
		defer { try? FileManager.default.removeItem(at: dir) }

		let pipeline = ImagePipeline(api: api, cacheDirectory: dir, session: makeSession())
		let data = try await pipeline.data(photoId: "p1", variant: .thumb)
		#expect(data == nil)
		let calls = await api.photoURLCalls
		#expect(calls == 1)
	}

	@Test func fetchesAndCachesOnDiskAndMemory() async throws {
		let photoURL = URL(string: "https://s3.example.com/photos/p1/thumb.jpg")!
		let api = ScriptedPhotoAPI(returnURL: photoURL)
		let dir = makeTempDir()
		defer { try? FileManager.default.removeItem(at: dir) }

		let expectedData = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02, 0x03])
		TestURLProtocol.handlerLock.withLock {
			TestURLProtocol.requestHandler = { request in
				// Verify Authorization header is NOT sent to S3
				#expect(request.value(forHTTPHeaderField: "Authorization") == nil)
				let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
				return (response, expectedData)
			}
		}

		let pipeline = ImagePipeline(api: api, cacheDirectory: dir, session: makeSession())

		// First fetch: network
		let data1 = try await pipeline.data(photoId: "p1", variant: .thumb)
		#expect(data1 == expectedData)

		let calls1 = await api.photoURLCalls
		#expect(calls1 == 1)

		// File should exist on disk at cacheDirectory/photoId/variant
		let diskFile = dir.appending(path: "p1").appending(path: "thumb")
		#expect(FileManager.default.fileExists(atPath: diskFile.path()))

		// Second fetch: should hit memory cache without calling api.photoURL again
		let data2 = try await pipeline.data(photoId: "p1", variant: .thumb)
		#expect(data2 == expectedData)
		let calls2 = await api.photoURLCalls
		#expect(calls2 == 1)

		// Third fetch from fresh pipeline (empty memory cache) should hit disk cache
		let pipeline2 = ImagePipeline(api: api, cacheDirectory: dir, session: makeSession())
		let data3 = try await pipeline2.data(photoId: "p1", variant: .thumb)
		#expect(data3 == expectedData)
		let calls3 = await api.photoURLCalls
		#expect(calls3 == 1) // Still 1! Disk cache avoided network and URL resolution
	}

	@Test func inFlightLoadsAreDeduplicated() async throws {
		let photoURL = URL(string: "https://s3.example.com/photos/p2/thumb.jpg")!
		let api = ScriptedPhotoAPI(returnURL: photoURL)
		let dir = makeTempDir()
		defer { try? FileManager.default.removeItem(at: dir) }

		let expectedData = Data([0x01, 0x02, 0x03, 0x04])
		nonisolated(unsafe) var networkFetches = 0

		TestURLProtocol.handlerLock.withLock {
			TestURLProtocol.requestHandler = { request in
				networkFetches += 1
				// Artificial slight delay to allow concurrent calls to overlap
				Thread.sleep(forTimeInterval: 0.05)
				let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
				return (response, expectedData)
			}
		}

		let pipeline = ImagePipeline(api: api, cacheDirectory: dir, session: makeSession())

		async let call1 = pipeline.data(photoId: "p2", variant: .thumb)
		async let call2 = pipeline.data(photoId: "p2", variant: .thumb)

		let (res1, res2) = try await (call1, call2)
		#expect(res1 == expectedData)
		#expect(res2 == expectedData)
		#expect(networkFetches == 1)
	}

	@Test func retriesOnExpiredURL() async throws {
		let expiredURL = URL(string: "https://s3.example.com/photos/p3/expired.jpg")!
		let freshURL = URL(string: "https://s3.example.com/photos/p3/fresh.jpg")!
		let api = ScriptedPhotoAPI(returnURL: nil)
		await api.setURLsToReturn([expiredURL, freshURL])
		let dir = makeTempDir()
		defer { try? FileManager.default.removeItem(at: dir) }

		let expectedData = Data([0xAA, 0xBB, 0xCC])
		nonisolated(unsafe) var requestsCount = 0

		TestURLProtocol.handlerLock.withLock {
			TestURLProtocol.requestHandler = { request in
				requestsCount += 1
				if request.url == expiredURL {
					let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
					return (response, Data())
				} else {
					let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
					return (response, expectedData)
				}
			}
		}

		let pipeline = ImagePipeline(api: api, cacheDirectory: dir, session: makeSession())
		let result = try await pipeline.data(photoId: "p3", variant: .display)
		#expect(result == expectedData)
		#expect(requestsCount == 2)
	}

	@Test func evictsOldestFilesWhenDiskCacheExceedsLimit() async throws {
		let dir = makeTempDir()
		defer { try? FileManager.default.removeItem(at: dir) }

		let photo1URL = URL(string: "https://s3.example.com/photos/p1/thumb.jpg")!
		let photo2URL = URL(string: "https://s3.example.com/photos/p2/thumb.jpg")!
		let api = ScriptedPhotoAPI(returnURL: photo1URL)

		let data1 = Data(repeating: 0x11, count: 300)
		let data2 = Data(repeating: 0x22, count: 300)

		TestURLProtocol.handlerLock.withLock {
			TestURLProtocol.requestHandler = { request in
				let d = request.url == photo1URL ? data1 : data2
				let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
				return (response, d)
			}
		}

		// Max disk bytes is 500, but writing two 300-byte files = 600 bytes
		let pipeline = ImagePipeline(api: api, cacheDirectory: dir, maxDiskBytes: 500, session: makeSession())

		_ = try await pipeline.data(photoId: "p1", variant: .thumb)
		let file1 = dir.appending(path: "p1").appending(path: "thumb")
		#expect(FileManager.default.fileExists(atPath: file1.path()))

		// Set modification date of file1 to the past
		try? FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -100)], ofItemAtPath: file1.path())

		await api.setReturnURL(photo2URL)
		_ = try await pipeline.data(photoId: "p2", variant: .thumb)

		let file2 = dir.appending(path: "p2").appending(path: "thumb")
		#expect(FileManager.default.fileExists(atPath: file2.path()))

		// File 1 should have been evicted by LRU!
		#expect(!FileManager.default.fileExists(atPath: file1.path()))
	}

	@Test func clearRemovesMemoryAndDiskData() async throws {
		let photoURL = URL(string: "https://s3.example.com/photos/p4/thumb.jpg")!
		let api = ScriptedPhotoAPI(returnURL: photoURL)
		let dir = makeTempDir()
		defer { try? FileManager.default.removeItem(at: dir) }

		let expectedData = Data([0xDE, 0xAD, 0xBE, 0xEF])
		TestURLProtocol.handlerLock.withLock {
			TestURLProtocol.requestHandler = { request in
				let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
				return (response, expectedData)
			}
		}

		let pipeline = ImagePipeline(api: api, cacheDirectory: dir, session: makeSession())
		_ = try await pipeline.data(photoId: "p4", variant: .thumb)

		let diskFile = dir.appending(path: "p4").appending(path: "thumb")
		#expect(FileManager.default.fileExists(atPath: diskFile.path()))

		await pipeline.clear()

		#expect(!FileManager.default.fileExists(atPath: diskFile.path()))
	}
}
