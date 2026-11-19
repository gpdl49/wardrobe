import Foundation
import CoreGraphics
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import WardrobeKit

// MARK: - Scripted Wardrobe API for Testing

final class ScriptedWardrobeAPI: WardrobeAPI, @unchecked Sendable {
	struct Call: Sendable {
		var method: String
		var path: String
		var idempotencyKey: String?
		var headers: [String: String]?
		var bodySummary: String?
	}

	private let lock = NSLock()
	private var _calls: [Call] = []

	var calls: [Call] {
		lock.lock()
		defer { lock.unlock() }
		return _calls
	}

	func record(_ call: Call) {
		lock.lock()
		_calls.append(call)
		lock.unlock()
	}

	var onCreateItem: (@Sendable (CreateItemRequest, String) async throws -> ItemSummaryDTO)?
	var onCreatePhoto: (@Sendable (CreatePhotoRequest, String) async throws -> PhotoUploadDTO)?
	var onUploadPhoto: (@Sendable (Data, URL, [String: String]) async throws -> Void)?
	var onCompletePhoto: (@Sendable (ID) async throws -> PhotoDTO)?
	var onUpdateItem: (@Sendable (ID, UpdateItemRequest) async throws -> ItemSummaryDTO)?

	// API protocol requirements
	func me() async throws -> MeDTO { throw APIError.network("unused") }
	func health() async throws -> Bool { true }
	func locations(_ query: LocationQuery) async throws -> [LocationDTO] { [] }
	func location(id: ID) async throws -> LocationDetailDTO { throw APIError.network("unused") }
	func location(code: String, owner: ID?) async throws -> LocationDTO { throw APIError.network("unused") }
	func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO { throw APIError.network("unused") }
	func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO { throw APIError.network("unused") }
	func deleteLocation(id: ID) async throws {}
	func categories() async throws -> [CategoryDTO] { [] }
	func tags(owner: ID?) async throws -> [TagCountDTO] { [] }
	func items(_ query: ItemQuery) async throws -> ItemListDTO { ItemListDTO(items: [], nextCursor: nil) }
	func item(id: ID) async throws -> ItemDetailDTO { throw APIError.network("unused") }

	func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO {
		record(Call(
			method: "POST",
			path: "/api/items",
			idempotencyKey: idempotencyKey,
			bodySummary: body.name
		))
		if let custom = onCreateItem {
			return try await custom(body, idempotencyKey)
		}
		let id = "item-\(UUID().uuidString.prefix(8).lowercased())"
		return ItemSummaryDTO(id: id, ownerId: "user-1", access: .owner, name: body.name, createdAt: .now, updatedAt: .now)
	}

	func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO {
		let nameVal: String?
		if case .value(let n) = body.name { nameVal = n } else { nameVal = nil }
		record(Call(
			method: "PATCH",
			path: "/api/items/\(id)",
			bodySummary: nameVal
		))
		if let custom = onUpdateItem {
			return try await custom(id, body)
		}
		return ItemSummaryDTO(id: id, ownerId: "user-1", access: .owner, name: nameVal, createdAt: .now, updatedAt: .now)
	}

	func deleteItem(id: ID) async throws {}
	func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult { MoveItemsResult(moved: 0) }
	func analyses(itemId: ID) async throws -> [AnalysisDTO] { [] }
	func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] { [] }
	func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO { throw APIError.network("unused") }

	func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO {
		record(Call(
			method: "POST",
			path: "/api/photos",
			idempotencyKey: idempotencyKey,
			bodySummary: "itemId=\(body.itemId ?? "nil")"
		))
		if let custom = onCreatePhoto {
			return try await custom(body, idempotencyKey)
		}
		let id = "photo-\(UUID().uuidString.prefix(8).lowercased())"
		let photo = PhotoDTO(
			id: id, ownerId: "user-1", access: .owner, itemId: body.itemId,
			kind: body.kind, status: .pending, contentType: body.contentType,
			size: body.size, createdAt: Date.now
		)
		let uploadUrl = URL(string: "https://s3.example.com/photos/\(id)/original")!
		let uploadHeaders = ["Content-Type": body.contentType]
		return PhotoUploadDTO(photo: photo, uploadUrl: uploadUrl, uploadHeaders: uploadHeaders)
	}

	func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws {
		record(Call(
			method: "PUT",
			path: url.absoluteString,
			headers: headers,
			bodySummary: "\(data.count) bytes"
		))
		if let custom = onUploadPhoto {
			try await custom(data, url, headers)
		}
	}

	func completePhoto(id: ID) async throws -> PhotoDTO {
		record(Call(
			method: "POST",
			path: "/api/photos/\(id)/complete"
		))
		if let custom = onCompletePhoto {
			return try await custom(id)
		}
		return PhotoDTO(
			id: id, ownerId: "user-1", access: .owner, itemId: "item-1",
			kind: .main, status: .processing, contentType: "image/jpeg",
			size: 100, createdAt: Date.now
		)
	}

	func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO { throw APIError.network("unused") }
	func deletePhoto(id: ID) async throws {}
	func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? { nil }
	func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO { throw APIError.network("unused") }
	func session(id: ID) async throws -> PackingSessionDetailDTO { throw APIError.network("unused") }
	func endSession(id: ID) async throws -> PackingSessionDTO { throw APIError.network("unused") }
	func shares() async throws -> [ShareDTO] { [] }
	func createShare(_ body: CreateShareRequest) async throws -> ShareDTO { throw APIError.network("unused") }
	func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO { throw APIError.network("unused") }
	func deleteShare(id: ID) async throws {}
	func sharedWithMe() async throws -> [SharedWithMeDTO] { [] }
}

// MARK: - Helpers

private func isUUIDv4(_ value: String?) -> Bool {
	guard let value, let id = UUID(uuidString: value) else { return false }
	return id.uuid.6 & 0xf0 == 0x40 && id.uuid.8 & 0xc0 == 0x80
}

private func makeTestImageData(width: Int = 100, height: Int = 100) -> Data {
	let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
	let context = CGContext(
		data: nil,
		width: width,
		height: height,
		bitsPerComponent: 8,
		bytesPerRow: 0,
		space: colorSpace,
		bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
	)!
	context.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
	context.fill(CGRect(x: 0, y: 0, width: width, height: height))
	let cgImage = context.makeImage()!

	let mutableData = NSMutableData()
	let destination = CGImageDestinationCreateWithData(
		mutableData,
		UTType.jpeg.identifier as CFString,
		1,
		nil
	)!
	CGImageDestinationAddImage(destination, cgImage, nil)
	CGImageDestinationFinalize(destination)
	return mutableData as Data
}

private func createTempDir() throws -> URL {
	let url = FileManager.default.temporaryDirectory.appending(path: "upload-tests-\(UUID().uuidString)")
	try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
	return url
}

// MARK: - Test Suite

@Suite("UploadQueueTests")
struct UploadQueueTests {

	@Test @MainActor func happyPathNewItem() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let api = ScriptedWardrobeAPI()
		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now },
			random: { 1.0 }
		)

		queue.start(userSub: "user-sub-1")

		let imageData = makeTestImageData()
		let target = UploadTarget.newItem(CreateItemRequest(name: "Blue Jumper", locationId: "loc-1"))
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: target, sessionId: "sess-1")

		#expect(queue.jobs.count == 1)
		#expect(queue.pendingCount == 1)
		#expect(queue.failedCount == 0)

		await queue.waitForIdle()

		#expect(queue.pendingCount == 0)
		#expect(queue.failedCount == 0)
		guard let job = queue.jobs.first(where: { $0.id == jobId }) else {
			Issue.record("Job not found")
			return
		}

		#expect(job.phase == .done)
		#expect(job.itemId != nil)
		#expect(job.photoId != nil)
		#expect(job.photo != nil)
		#expect(job.lastError == nil)
		#expect(queue.itemId(of: jobId) == job.itemId)

		// Assert API calls sequence
		let calls = api.calls
		#expect(calls.count == 4)
		#expect(calls[0].method == "POST" && calls[0].path == "/api/items")
		#expect(isUUIDv4(calls[0].idempotencyKey))
		#expect(calls[1].method == "POST" && calls[1].path == "/api/photos")
		#expect(isUUIDv4(calls[1].idempotencyKey))
		#expect(calls[0].idempotencyKey != calls[1].idempotencyKey)
		#expect(calls[2].method == "PUT")
		#expect(calls[3].method == "POST" && calls[3].path.contains("/complete"))

		// Contract: files deleted on finish
		let userDir = tempDir.appending(path: "user-sub-1")
		let jsonFile = userDir.appending(path: "\(jobId.uuidString.lowercased()).json")
		let jpgFile = userDir.appending(path: "\(jobId.uuidString.lowercased()).jpg")
		let origFile = userDir.appending(path: "\(jobId.uuidString.lowercased()).original")
		#expect(!FileManager.default.fileExists(atPath: jsonFile.path(percentEncoded: false)))
		#expect(!FileManager.default.fileExists(atPath: jpgFile.path(percentEncoded: false)))
		#expect(!FileManager.default.fileExists(atPath: origFile.path(percentEncoded: false)))
	}

	@Test @MainActor func happyPathExistingItem() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let api = ScriptedWardrobeAPI()
		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)

		queue.start(userSub: "user-sub-1")

		let imageData = makeTestImageData()
		let target = UploadTarget.item("item-existing-99")
		let jobId = try queue.enqueue(imageData: imageData, kind: .label, target: target, sessionId: nil)

		await queue.waitForIdle()

		let job = queue.jobs.first { $0.id == jobId }
		#expect(job?.phase == .done)
		#expect(job?.itemId == "item-existing-99")

		// createItem must be skipped
		let calls = api.calls
		#expect(!calls.contains { $0.method == "POST" && $0.path == "/api/items" })
		#expect(calls.contains { $0.method == "POST" && $0.path == "/api/photos" })
		#expect(calls.contains { $0.method == "PUT" })
		#expect(calls.contains { $0.method == "POST" && $0.path.contains("/complete") })
	}

	@Test @MainActor func legacyJobsKeepTheirOriginalKeys() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }
		var job = UploadJob(userSub: "legacy-user", target: .newItem(CreateItemRequest(name: "Legacy")), kind: .main)
		job.itemIdempotencyKey = nil
		job.photoIdempotencyKey = nil
		let store = UploadStore(directory: tempDir)
		try store.saveOriginalData(makeTestImageData(), for: job.id, userSub: job.userSub)
		try store.saveJob(job)
		let api = ScriptedWardrobeAPI()
		let queue = UploadQueue(api: api, directory: tempDir, sleeper: { _ in })
		queue.start(userSub: job.userSub)
		await queue.waitForIdle()
		let item = api.calls.first { $0.path == "/api/items" }
		let photo = api.calls.first { $0.path == "/api/photos" }
		#expect(item?.idempotencyKey == "\(job.id.uuidString.lowercased())-item")
		#expect(photo?.idempotencyKey == "\(job.id.uuidString.lowercased())-photo")
	}

	@Test @MainActor func crashAndResumeContinuesFromInterruptedStep() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let api1 = ScriptedWardrobeAPI()

		let queue1 = UploadQueue(
			api: api1,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)

		api1.onCreatePhoto = { _, _ in
			// App terminates right here while createPhoto is in flight
			await MainActor.run {
				queue1.pause()
			}
			throw CancellationError()
		}

		queue1.start(userSub: "user-sub-1")

		let imageData = makeTestImageData()
		let target = UploadTarget.newItem(CreateItemRequest(name: "Coat", locationId: "loc-1"))
		let jobId = try queue1.enqueue(imageData: imageData, kind: .main, target: target, sessionId: nil)

		await queue1.waitForIdle()

		let jobBeforeReload = queue1.jobs.first { $0.id == jobId }
		let createdItemId = jobBeforeReload?.itemId
		#expect(createdItemId != nil)

		// Check on-disk persistence: item was saved before interruption
		let store = UploadStore(directory: tempDir)
		let persistedJobs = try store.loadJobs(for: "user-sub-1")
		#expect(persistedJobs.count == 1)
		#expect(persistedJobs[0].itemId == createdItemId)

		// Create a brand new UploadQueue instance on the same directory
		let api2 = ScriptedWardrobeAPI()
		let queue2 = UploadQueue(
			api: api2,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)
		queue2.start(userSub: "user-sub-1")

		await queue2.waitForIdle()

		let reloadedJob = queue2.jobs.first { $0.id == jobId }
		#expect(reloadedJob?.phase == .done)
		#expect(reloadedJob?.itemId == createdItemId)

		// Verify createItem was NOT called a second time
		#expect(api2.calls.filter { $0.method == "POST" && $0.path == "/api/items" }.isEmpty)
		#expect(api2.calls.contains { $0.method == "POST" && $0.path == "/api/photos" })
	}

	@Test @MainActor func retriesWithSameIdempotencyKeysAndFrozenBody() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let shouldFail = LockIsolated(true)
		let api = ScriptedWardrobeAPI()
		api.onCreateItem = { body, key in
			if shouldFail.value {
				throw APIError(status: 503, error: "service_unavailable", message: "Temporary failure")
			}
			return ItemSummaryDTO(id: "item-created", ownerId: "user-1", access: .owner, name: body.name, createdAt: .now, updatedAt: .now)
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now },
			backoffBase: 100 // long backoff so attempt 1 stays waiting until resume()
		)

		queue.start(userSub: "user-sub-1")

		let imageData = makeTestImageData()
		let target = UploadTarget.newItem(CreateItemRequest(name: "Scarf", locationId: "loc-1"))
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: target, sessionId: nil)

		await queue.waitForIdle()

		let jobWaiting = queue.jobs.first { $0.id == jobId }
		#expect(jobWaiting?.phase == .waiting)
		#expect(jobWaiting?.attempts == 1)

		// User edits fields while item creation failed/is backing off
		queue.updateNewItemFields(jobId: jobId, CreateItemRequest(name: "Wool Scarf"))

		// Allow createItem to succeed and kick queue
		shouldFail.withValue { $0 = false }
		queue.resume()

		await queue.waitForIdle()

		let itemCreates = api.calls.filter { $0.method == "POST" && $0.path == "/api/items" }
		#expect(itemCreates.count == 2)
		// Both attempts must use the EXACT same idempotency key and frozen initial name
		for call in itemCreates {
			#expect(call.idempotencyKey == itemCreates[0].idempotencyKey)
			#expect(call.bodySummary == "Scarf")
		}

		// The updated field was sent via updateItem (PATCH)
		let itemUpdates = api.calls.filter { $0.method == "PATCH" && $0.path == "/api/items/item-created" }
		#expect(itemUpdates.count == 1)
		if !itemUpdates.isEmpty {
			#expect(itemUpdates[0].bodySummary == "Wool Scarf")
		}

		let doneJob = queue.jobs.first { $0.id == jobId }
		#expect(doneJob?.phase == .done)
	}

	@Test @MainActor func handlesUploadExpiredByRequestingFreshPresignedURL() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let expired = LockIsolated(true)
		let api = ScriptedWardrobeAPI()
		api.onUploadPhoto = { _, _, _ in
			let isExpired = expired.withValue { val -> Bool in
				if val {
					val = false
					return true
				}
				return false
			}
			if isExpired {
				throw APIError(status: 403, error: "upload_expired", message: "Presigned URL expired")
			}
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now },
			backoffBase: 0
		)
		queue.start(userSub: "user-sub-1")

		let imageData = makeTestImageData()
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: .item("item-1"), sessionId: nil)

		await queue.waitForIdle()

		let photoCreates = api.calls.filter { $0.method == "POST" && $0.path == "/api/photos" }
		#expect(photoCreates.count == 2)
		#expect(isUUIDv4(photoCreates[0].idempotencyKey))
		#expect(photoCreates[1].idempotencyKey == photoCreates[0].idempotencyKey)

		let puts = api.calls.filter { $0.method == "PUT" }
		#expect(puts.count == 2)

		let job = queue.jobs.first { $0.id == jobId }
		#expect(job?.phase == .done)
	}

	@Test @MainActor func permanentFailureDoesNotRetryAndRetryRequeues() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let fail = LockIsolated(true)
		let api = ScriptedWardrobeAPI()
		api.onCreateItem = { _, _ in
			if fail.value {
				throw APIError(status: 422, error: "unprocessable", message: "Location is archived")
			}
			return ItemSummaryDTO(id: "item-ok", ownerId: "user-1", access: .owner, name: "Shirt", createdAt: .now, updatedAt: .now)
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)
		queue.start(userSub: "user-sub-1")

		let imageData = makeTestImageData()
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: .newItem(CreateItemRequest(name: "Shirt")), sessionId: nil)

		await queue.waitForIdle()

		let job = queue.jobs.first { $0.id == jobId }
		#expect(job?.phase == .failed)
		#expect(job?.lastError == "Location is archived")
		#expect(queue.failedCount == 1)

		// Fix error and retry
		fail.withValue { $0 = false }
		queue.retry(jobId: jobId)
		#expect(queue.failedCount == 0)

		await queue.waitForIdle()
		let jobAfter = queue.jobs.first { $0.id == jobId }
		#expect(jobAfter?.phase == .done)
	}

	@Test @MainActor func perUserIsolation() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let api = ScriptedWardrobeAPI()
		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)

		// User A enqueues and pauses
		queue.start(userSub: "user-a")
		queue.pause()
		let imageData = makeTestImageData()
		let jobA = try queue.enqueue(imageData: imageData, kind: .main, target: .item("item-a"), sessionId: nil)

		#expect(api.calls.isEmpty)

		// User B signs in: sees 0 jobs, does not run User A's jobs
		queue.start(userSub: "user-b")
		#expect(queue.jobs.isEmpty)
		#expect(api.calls.isEmpty)

		// User A signs back in
		queue.start(userSub: "user-a")
		#expect(queue.jobs.count == 1)
		#expect(queue.jobs[0].id == jobA)

		await queue.waitForIdle()

		#expect(queue.jobs[0].phase == .done)
		#expect(api.calls.contains { $0.method == "POST" && $0.path == "/api/photos" })
	}

	@Test @MainActor func maxConcurrencyLimitsInFlightJobs() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let inFlightCount = LockIsolated(0)
		let maxObservedInFlight = LockIsolated(0)

		let api = ScriptedWardrobeAPI()
		api.onUploadPhoto = { _, _, _ in
			inFlightCount.withValue { count in
				count += 1
				maxObservedInFlight.withValue { maxCount in
					if count > maxCount { maxCount = count }
				}
			}
			try await Task.sleep(for: .milliseconds(50))
			inFlightCount.withValue { count in
				count -= 1
			}
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now },
			concurrency: 2
		)
		queue.start(userSub: "user-concurrency")

		let imageData = makeTestImageData()
		for i in 1...4 {
			try queue.enqueue(imageData: imageData, kind: .main, target: .item("item-\(i)"), sessionId: nil)
		}

		await queue.waitForIdle()

		#expect(maxObservedInFlight.value <= 2)
		#expect(queue.jobs.allSatisfy { $0.phase == .done })
	}

	@Test @MainActor func jobsForSameItemAreSerialized() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let inFlightForItem = LockIsolated(0)
		let maxObservedForItem = LockIsolated(0)

		let api = ScriptedWardrobeAPI()
		api.onUploadPhoto = { _, _, _ in
			inFlightForItem.withValue { count in
				count += 1
				maxObservedForItem.withValue { maxCount in
					if count > maxCount { maxCount = count }
				}
			}
			try await Task.sleep(for: .milliseconds(40))
			inFlightForItem.withValue { count in
				count -= 1
			}
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now },
			concurrency: 2
		)
		queue.start(userSub: "user-serialize")

		let imageData = makeTestImageData()
		try queue.enqueue(imageData: imageData, kind: .main, target: .item("shared-item"), sessionId: nil)
		try queue.enqueue(imageData: imageData, kind: .label, target: .item("shared-item"), sessionId: nil)

		await queue.waitForIdle()

		#expect(maxObservedForItem.value == 1)
		#expect(queue.jobs.allSatisfy { $0.phase == .done })
	}

	@Test @MainActor func signedOutErrorPausesQueueWithoutMarkingFailed() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let signedIn = LockIsolated(false)
		let api = ScriptedWardrobeAPI()
		api.onCreateItem = { _, _ in
			if !signedIn.value {
				throw APIError.signedOut
			}
			return ItemSummaryDTO(id: "item-1", ownerId: "user-1", access: .owner, name: "Hat", createdAt: .now, updatedAt: .now)
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)
		queue.start(userSub: "user-auth")

		let imageData = makeTestImageData()
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: .newItem(CreateItemRequest(name: "Hat")), sessionId: nil)

		await queue.waitForIdle()

		let job = queue.jobs.first { $0.id == jobId }
		#expect(job?.phase == .waiting)
		#expect(queue.failedCount == 0)

		// User signs in again: call resume()
		signedIn.withValue { $0 = true }
		queue.resume()

		await queue.waitForIdle()

		let jobDone = queue.jobs.first { $0.id == jobId }
		#expect(jobDone?.phase == .done)
	}

	@Test @MainActor func networkMonitorTriggersResume() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let monitor = TestNetworkPathMonitor()
		let offline = LockIsolated(true)
		let api = ScriptedWardrobeAPI()
		api.onCreateItem = { _, _ in
			if offline.value {
				throw APIError.network("No connection")
			}
			return ItemSummaryDTO(id: "item-net", ownerId: "user-1", access: .owner, name: "Bag", createdAt: .now, updatedAt: .now)
		}

		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			networkMonitor: monitor,
			sleeper: { _ in },
			clock: { Date.now }
		)
		queue.start(userSub: "user-net")

		let imageData = makeTestImageData()
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: .newItem(CreateItemRequest(name: "Bag")), sessionId: nil)

		await queue.waitForIdle()

		let job = queue.jobs.first { $0.id == jobId }
		#expect(job?.phase == .waiting)
		#expect(job?.attempts == 1)

		// Network comes back online!
		offline.withValue { $0 = false }
		monitor.triggerUpdate(isSatisfied: true)

		await queue.waitForIdle()

		let doneJob = queue.jobs.first { $0.id == jobId }
		#expect(doneJob?.phase == .done)
	}

	@Test @MainActor func extraPhotosAttachToTheItemOfTheirParentJob() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }
		let api = ScriptedWardrobeAPI()
		let queue = UploadQueue(api: api, directory: tempDir, sleeper: { _ in }, clock: { Date.now })
		queue.start(userSub: "user-multi")

		let front = try queue.enqueue(
			imageData: makeTestImageData(), kind: .main,
			target: .newItem(CreateItemRequest(name: "Coat")), sessionId: nil
		)
		let back = try queue.enqueue(imageData: makeTestImageData(), kind: .back, target: .afterJob(front), sessionId: nil)
		let label = try queue.enqueue(imageData: makeTestImageData(), kind: .label, target: .afterJob(front), sessionId: nil)

		await queue.waitForIdle()

		let itemId = queue.itemId(of: front)
		#expect(itemId != nil)
		for id in [front, back, label] {
			let job = queue.jobs.first { $0.id == id }
			#expect(job?.phase == .done)
			#expect(job?.itemId == itemId)
		}
		let calls = api.calls
		#expect(calls.filter { $0.path == "/api/items" }.count == 1)
		let photoCalls = calls.filter { $0.path == "/api/photos" }
		#expect(photoCalls.count == 3)
		#expect(photoCalls.allSatisfy { $0.bodySummary == "itemId=\(itemId ?? "nil")" })
		// The front is created first, so it becomes the cover.
		#expect(calls.firstIndex { $0.path == "/api/photos" } == 1)
	}

	@Test @MainActor func extraPhotosWaitForAFailedParentAndFollowItsRetry() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }
		let fail = LockIsolated(true)
		let api = ScriptedWardrobeAPI()
		api.onCreateItem = { body, _ in
			if fail.value {
				throw APIError(status: 422, error: "unprocessable", message: "Location is archived")
			}
			return ItemSummaryDTO(id: "item-late", ownerId: "user-1", access: .owner, name: body.name, createdAt: .now, updatedAt: .now)
		}
		let queue = UploadQueue(api: api, directory: tempDir, sleeper: { _ in }, clock: { Date.now })
		queue.start(userSub: "user-wait")

		let front = try queue.enqueue(
			imageData: makeTestImageData(), kind: .main,
			target: .newItem(CreateItemRequest(name: "Coat")), sessionId: nil
		)
		let back = try queue.enqueue(imageData: makeTestImageData(), kind: .back, target: .afterJob(front), sessionId: nil)

		await queue.waitForIdle()
		#expect(queue.jobs.first { $0.id == front }?.phase == .failed)
		#expect(queue.jobs.first { $0.id == back }?.phase == .waiting)
		#expect(!api.calls.contains { $0.path == "/api/photos" })

		fail.withValue { $0 = false }
		queue.retry(jobId: front)
		await queue.waitForIdle()
		#expect(queue.jobs.first { $0.id == back }?.phase == .done)
		#expect(queue.jobs.first { $0.id == back }?.itemId == "item-late")
	}

	@Test @MainActor func discardingAParentDiscardsItsWaitingPhotos() async throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }
		let queue = UploadQueue(api: ScriptedWardrobeAPI(), directory: tempDir, sleeper: { _ in }, clock: { Date.now })
		queue.start(userSub: "user-cascade")
		queue.pause()

		let front = try queue.enqueue(
			imageData: makeTestImageData(), kind: .main,
			target: .newItem(CreateItemRequest(name: "Coat")), sessionId: nil
		)
		_ = try queue.enqueue(imageData: makeTestImageData(), kind: .back, target: .afterJob(front), sessionId: nil)
		_ = try queue.enqueue(imageData: makeTestImageData(), kind: .label, target: .item("item-other"), sessionId: nil)

		queue.discard(jobId: front)
		#expect(queue.jobs.count == 1)
		#expect(queue.jobs.first?.target == .item("item-other"))
	}

	@Test func afterJobTargetRoundTrips() throws {
		let parent = UUID()
		let job = UploadJob(userSub: "u", target: .afterJob(parent), kind: .back)
		let decoded = try JSONDecoder().decode(UploadJob.self, from: JSONEncoder().encode(job))
		#expect(decoded.target == .afterJob(parent))
		#expect(decoded.kind == .back)
	}

	@Test @MainActor func discardRemovesJobAndFiles() throws {
		let tempDir = try createTempDir()
		defer { try? FileManager.default.removeItem(at: tempDir) }

		let api = ScriptedWardrobeAPI()
		let queue = UploadQueue(
			api: api,
			directory: tempDir,
			sleeper: { _ in },
			clock: { Date.now }
		)
		queue.start(userSub: "user-discard")
		queue.pause()

		let imageData = makeTestImageData()
		let jobId = try queue.enqueue(imageData: imageData, kind: .main, target: .item("item-1"), sessionId: nil)

		#expect(queue.jobs.count == 1)
		let store = UploadStore(directory: tempDir)
		#expect(FileManager.default.fileExists(atPath: store.jobFileURL(id: jobId, userSub: "user-discard").path(percentEncoded: false)))

		queue.discard(jobId: jobId)
		#expect(queue.jobs.isEmpty)
		#expect(!FileManager.default.fileExists(atPath: store.jobFileURL(id: jobId, userSub: "user-discard").path(percentEncoded: false)))
	}
}

// MARK: - Lock Isolated Helper for Tests

private final class LockIsolated<Value>: @unchecked Sendable {
	private let lock = NSLock()
	private var _value: Value

	init(_ value: Value) {
		self._value = value
	}

	var value: Value {
		lock.lock()
		defer { lock.unlock() }
		return _value
	}

	func withValue<R>(_ body: (inout Value) throws -> R) rethrows -> R {
		lock.lock()
		defer { lock.unlock() }
		return try body(&_value)
	}
}
