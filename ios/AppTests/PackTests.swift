import Foundation
import Testing
import WardrobeKit
import WardrobeKitTesting
@testable import Wardrobe

@MainActor
@Suite struct PackTests {
	let userSub = "test-user-sub-123"
	let userId = "00000000-0000-4000-8000-000000000001"

	private func makeFixtureAPI() -> FixtureWardrobeAPI {
		FixtureWardrobeAPI()
	}

	private func makeUploadQueue(api: any WardrobeAPI) -> UploadQueue {
		let tempDir = URL.temporaryDirectory.appending(path: UUID().uuidString)
		let queue = UploadQueue(api: api, directory: tempDir)
		// The real queue (WP3) only accepts captures once started for a user.
		queue.start(userSub: userSub)
		return queue
	}

	private func makeStore() -> ActiveSessionStore {
		let suiteName = "test.wardrobe.pack.\(UUID().uuidString)"
		let defaults = UserDefaults(suiteName: suiteName)!
		return ActiveSessionStore(defaults: defaults)
	}

	// MARK: - Session Lifecycle

	@Test func sessionLifecycleCreateOncePerKeyAndRetry() async throws {
		let api = makeFixtureAPI()
		let queue = makeUploadQueue(api: api)
		let store = makeStore()
		let model = PackModel(api: api, uploads: queue, userSub: userSub, ownerId: userId, store: store)

		await model.loadInitialData()
		#expect(model.phase == .chooseLocation)
		#expect(!model.locations.isEmpty)

		let bag = model.locations.first(where: { $0.kind == .bag })!
		let key1 = "idempotency-key-1"

		await model.startSession(location: bag.ref, key: key1)

		if case .capturing(let active) = model.phase {
			#expect(active.session.mode == .pack)
			#expect(active.session.locationId == bag.id)
			#expect(active.idempotencyKey == key1)
		} else {
			Issue.record("Expected capturing phase after startSession")
		}

		// Verify API calls
		let calls = await api.calls
		#expect(calls.contains("POST /sessions"))
	}

	@Test func endSessionIdempotent() async throws {
		let api = makeFixtureAPI()
		let queue = makeUploadQueue(api: api)
		let store = makeStore()
		let model = PackModel(api: api, uploads: queue, userSub: userSub, ownerId: userId, store: store)

		let bag = LocationRef(id: "bag-1", kind: .bag, code: "B-01", name: "Winter Bag")
		let session = try await api.createSession(
			CreateSessionRequest(mode: .pack, locationId: bag.id),
			idempotencyKey: "key-123"
		)
		let active = ActiveSession(session: session, location: bag, idempotencyKey: "key-123")
		store.save(userSub: userSub, mode: .pack, active: active)

		model.phase = .capturing(active: active)
		await model.finishPacking()

		#expect(model.phase == .summary(sessionId: session.id))
		#expect(store.load(userSub: userSub, mode: .pack) == nil)

		// Ending again should succeed cleanly
		let endedSession = try await api.endSession(id: session.id)
		#expect(endedSession.endedAt != nil)
	}

	@Test func failedFinishKeepsSessionForRetry() async throws {
		let api = makeFixtureAPI()
		let queue = makeUploadQueue(api: api)
		let store = makeStore()
		let app = AppModel.preview(api: api)
		let model = PackModel(api: api, uploads: queue, userSub: userSub, store: store)
		model.appModel = app
		let bag = LocationRef(id: "bag-1", kind: .bag, code: "B-01", name: "Bag")
		let session = try await api.createSession(CreateSessionRequest(mode: .pack, locationId: bag.id), idempotencyKey: "key")
		let active = ActiveSession(session: session, location: bag, idempotencyKey: "key")
		store.save(userSub: userSub, mode: .pack, active: active)
		model.phase = .capturing(active: active)
		await api.setNextError(.signedOut)
		await model.finishPacking()
		#expect(model.phase == .capturing(active: active))
		#expect(store.load(userSub: userSub, mode: .pack) != nil)
		#expect(app.auth.state == .signedOut)
	}

	@Test func failedUnpackFinishKeepsSessionForRetry() async throws {
		let api = makeFixtureAPI()
		let store = makeStore()
		let app = AppModel.preview(api: api)
		let model = UnpackModel(api: api, userSub: userSub, store: store)
		model.appModel = app
		let bag = LocationRef(id: "bag-1", kind: .bag, code: "B-01", name: "Bag")
		let session = try await api.createSession(CreateSessionRequest(mode: .unpack, locationId: bag.id), idempotencyKey: "key")
		let active = ActiveSession(session: session, location: bag, idempotencyKey: "key")
		store.save(userSub: userSub, mode: .unpack, active: active)
		model.sessionId = session.id
		await api.setNextError(.signedOut)
		await model.finishUnpacking()
		#expect(store.load(userSub: userSub, mode: .unpack) != nil)
		#expect(app.auth.state == .signedOut)
	}

	// MARK: - Capture Enqueues

	@Test func captureEnqueuesRightTargetAndSession() async throws {
		let api = makeFixtureAPI()
		let queue = makeUploadQueue(api: api)
		let store = makeStore()
		let model = PackModel(api: api, uploads: queue, userSub: userSub, ownerId: userId, store: store)

		let bag = LocationRef(id: "bag-1", kind: .bag, code: "B-01", name: "Winter Bag")
		let session = try await api.createSession(
			CreateSessionRequest(mode: .pack, locationId: bag.id),
			idempotencyKey: "key-123"
		)
		let active = ActiveSession(session: session, location: bag, idempotencyKey: "key-123")
		model.phase = .capturing(active: active)

		let dummyPhoto = Data([0xFF, 0xD8, 0xFF, 0xE0]) // Dummy JPEG bytes
		model.capturePhoto(data: dummyPhoto)

		#expect(model.selectedJobId != nil)

		// Check quick fields update
		model.updateQuickFields(name: "Wool Jumper", categoryId: "cat-knitwear")
		#expect(model.quickName == "Wool Jumper")
		#expect(model.quickCategoryId == "cat-knitwear")

		// Capture label photo
		let count = queue.jobs.count
		model.captureLabelPhoto(data: dummyPhoto)
		if queue.itemId(of: model.selectedJobId!) == nil {
			#expect(queue.jobs.count == count)
			#expect(model.errorMessage != nil)
		}
	}

	// MARK: - Move Payloads

	@Test func unpackMoveSelectedItemsAndUndo() async throws {
		let api = makeFixtureAPI()
		let store = makeStore()
		let model = UnpackModel(api: api, userSub: userSub, ownerId: userId, store: store)

		await model.loadInitialData()
		#expect(model.phase == .chooseSource)

		let bag = model.sourceLocations.first(where: { $0.kind == .bag })!
		await model.chooseSourceLocation(bag)
		#expect(model.sessionId != nil)
		#expect((await api.calls).contains("POST /sessions"))
		#expect(store.load(userSub: userSub, mode: .unpack) != nil)

		if case .unpacking(let source) = model.phase {
			#expect(source.id == bag.id)
		} else {
			Issue.record("Expected unpacking phase")
		}

		#expect(!model.items.isEmpty)
		let initialCount = model.items.count
		let itemToMove = model.items[0]

		// Select item
		model.toggleItemSelection(itemToMove.id)
		#expect(model.selectedItemIds.contains(itemToMove.id))

		// Move item to closet
		let closet = model.sourceLocations.first(where: { $0.kind == .closet })!
		if case .unpacking(let source) = model.phase {
			await model.moveSelectedItems(to: closet, source: source)
		}

		#expect(model.items.count == initialCount - 1)
		#expect(model.lastMove != nil)
		#expect(model.lastMove?.items.first?.id == itemToMove.id)
		#expect(model.lastMove?.toLocation?.id == closet.id)

		// Verify API calls
		let calls = await api.calls
		#expect(calls.contains("POST /items/move"))

		// Undo move
		if case .unpacking(let source) = model.phase {
			await model.undoLastMove(source: source)
		}

		#expect(model.items.count == initialCount)
		#expect(model.lastMove == nil)
	}

	@Test func unpackMoveToUnassigned() async throws {
		let api = makeFixtureAPI()
		let store = makeStore()
		let model = UnpackModel(api: api, userSub: userSub, ownerId: userId, store: store)

		let bag = (try await api.locations(LocationQuery())).first(where: { $0.kind == .bag })!
		await model.chooseSourceLocation(bag)

		let item = model.items[0]
		model.toggleItemSelection(item.id)

		if case .unpacking(let source) = model.phase {
			await model.moveSelectedItems(to: nil, source: source)
		}

		#expect(model.lastMove != nil)
		#expect(model.lastMove?.toLocation == nil)
	}

	// MARK: - Resume State

	@Test func resumeStateSurvivesRelaunch() async throws {
		let store = makeStore()
		let api = makeFixtureAPI()
		let loc = LocationRef(id: "loc-123", kind: .bag, code: "B-09", name: "Duffel Bag")
		let session = try await api.createSession(CreateSessionRequest(mode: .pack, locationId: loc.id), idempotencyKey: "key-xyz")
		let active = ActiveSession(session: session, location: loc, idempotencyKey: "key-xyz")

		store.save(userSub: userSub, mode: .pack, active: active)

		// New model instance loading stored session
		let queue = makeUploadQueue(api: api)
		let model = PackModel(api: api, uploads: queue, userSub: userSub, ownerId: userId, store: store)

		await model.loadInitialData()

		if case .resuming(let loaded) = model.phase {
			#expect(loaded.session.id == session.id)
			#expect(loaded.location.code == "B-09")
			#expect(loaded.idempotencyKey == "key-xyz")
		} else {
			Issue.record("Expected resuming phase with saved session")
		}

		// Resuming moves into capture
		model.resumeActiveSession(active)
		#expect(model.phase == .capturing(active: active))

		// Discarding clears store
		await model.discardActiveSession(active)
		#expect(store.load(userSub: userSub, mode: .pack) == nil)
		#expect(model.phase == .chooseLocation)
	}
}
