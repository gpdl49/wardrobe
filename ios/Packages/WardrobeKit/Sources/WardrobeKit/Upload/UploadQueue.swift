import Foundation
import Observation

// MARK: - Target and Job Types

/// What a capture should become.
public enum UploadTarget: Codable, Hashable, Sendable {
	/// Add the photo to an existing item.
	case item(ID)
	case outfit(ID)
	/// Create the item first (POST /items with the job's key), then attach.
	case newItem(CreateItemRequest)
}

/// One capture on its way to the server. Snapshot type for the UI.
public struct UploadJob: Codable, Hashable, Sendable, Identifiable {
	public enum Phase: String, Codable, Sendable {
		case waiting, running, failed, done
	}
	public enum Step: String, Codable, Sendable {
		case prepare, createItem, createPhoto, upload, complete, updateItem
	}

	public var id: UUID
	/// Zitadel subject of the user who captured it.
	public var userSub: String
	public var target: UploadTarget
	public var kind: PhotoKind
	public var sessionId: ID?
	public var createdAt: Date
	public var phase: Phase
	/// The step it needs next; nil when done.
	public var step: Step?
	public var itemId: ID?
	public var photoId: ID?
	/// The completed photo.
	public var photo: PhotoDTO?
	/// Last failure, for the UI.
	public var lastError: String?
	public var attempts: Int

	// MARK: Internal State
	var itemIdempotencyKey: String?
	var photoIdempotencyKey: String?
	var isPrepared: Bool
	var createItemSent: Bool
	var frozenCreateItemRequest: CreateItemRequest?
	var pendingUpdateFields: CreateItemRequest?
	var uploadUrl: URL?
	var uploadHeaders: [String: String]?
	var isUploaded: Bool
	var nextAttemptAt: Date?

	public init(
		id: UUID = UUID(), userSub: String, target: UploadTarget, kind: PhotoKind,
		sessionId: ID? = nil, createdAt: Date = .now, phase: Phase = .waiting,
		step: Step? = .prepare, itemId: ID? = nil, photoId: ID? = nil,
		photo: PhotoDTO? = nil, lastError: String? = nil, attempts: Int = 0
	) {
		self.id = id; self.userSub = userSub; self.target = target; self.kind = kind
		self.sessionId = sessionId; self.createdAt = createdAt; self.phase = phase
		self.step = step; self.itemId = itemId; self.photoId = photoId
		self.photo = photo; self.lastError = lastError; self.attempts = attempts
		self.itemIdempotencyKey = UUID().uuidString.lowercased()
		self.photoIdempotencyKey = UUID().uuidString.lowercased()
		self.isPrepared = (step != .prepare)
		self.createItemSent = false
		self.frozenCreateItemRequest = nil
		self.pendingUpdateFields = nil
		self.uploadUrl = nil
		self.uploadHeaders = nil
		self.isUploaded = false
		self.nextAttemptAt = nil
	}

	enum CodingKeys: String, CodingKey {
		case id, userSub, target, kind, sessionId, createdAt, phase, step
		case itemId, photoId, photo, lastError, attempts
		case itemIdempotencyKey, photoIdempotencyKey
		case isPrepared, createItemSent, frozenCreateItemRequest, pendingUpdateFields
		case uploadUrl, uploadHeaders, isUploaded, nextAttemptAt
	}

	public init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		self.id = try container.decode(UUID.self, forKey: .id)
		self.userSub = try container.decode(String.self, forKey: .userSub)
		self.target = try container.decode(UploadTarget.self, forKey: .target)
		self.kind = try container.decode(PhotoKind.self, forKey: .kind)
		self.sessionId = try container.decodeIfPresent(WardrobeKit.ID.self, forKey: .sessionId)
		self.createdAt = try container.decode(Date.self, forKey: .createdAt)
		self.phase = try container.decode(Phase.self, forKey: .phase)
		self.step = try container.decodeIfPresent(Step.self, forKey: .step)
		self.itemId = try container.decodeIfPresent(WardrobeKit.ID.self, forKey: .itemId)
		self.photoId = try container.decodeIfPresent(WardrobeKit.ID.self, forKey: .photoId)
		self.photo = try container.decodeIfPresent(PhotoDTO.self, forKey: .photo)
		self.lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
		self.attempts = try container.decode(Int.self, forKey: .attempts)

		self.itemIdempotencyKey = try container.decodeIfPresent(String.self, forKey: .itemIdempotencyKey)
		self.photoIdempotencyKey = try container.decodeIfPresent(String.self, forKey: .photoIdempotencyKey)
		self.isPrepared = try container.decodeIfPresent(Bool.self, forKey: .isPrepared) ?? (step != .prepare)
		self.createItemSent = try container.decodeIfPresent(Bool.self, forKey: .createItemSent) ?? (itemId != nil)
		self.frozenCreateItemRequest = try container.decodeIfPresent(CreateItemRequest.self, forKey: .frozenCreateItemRequest)
		self.pendingUpdateFields = try container.decodeIfPresent(CreateItemRequest.self, forKey: .pendingUpdateFields)
		self.uploadUrl = try container.decodeIfPresent(URL.self, forKey: .uploadUrl)
		self.uploadHeaders = try container.decodeIfPresent([String: String].self, forKey: .uploadHeaders)
		self.isUploaded = try container.decodeIfPresent(Bool.self, forKey: .isUploaded) ?? false
		self.nextAttemptAt = try container.decodeIfPresent(Date.self, forKey: .nextAttemptAt)
	}

	public func encode(to encoder: Encoder) throws {
		var container = encoder.container(keyedBy: CodingKeys.self)
		try container.encode(id, forKey: .id)
		try container.encode(userSub, forKey: .userSub)
		try container.encode(target, forKey: .target)
		try container.encode(kind, forKey: .kind)
		try container.encodeIfPresent(sessionId, forKey: .sessionId)
		try container.encode(createdAt, forKey: .createdAt)
		try container.encode(phase, forKey: .phase)
		try container.encodeIfPresent(step, forKey: .step)
		try container.encodeIfPresent(itemId, forKey: .itemId)
		try container.encodeIfPresent(photoId, forKey: .photoId)
		try container.encodeIfPresent(photo, forKey: .photo)
		try container.encodeIfPresent(lastError, forKey: .lastError)
		try container.encode(attempts, forKey: .attempts)

		try container.encodeIfPresent(itemIdempotencyKey, forKey: .itemIdempotencyKey)
		try container.encodeIfPresent(photoIdempotencyKey, forKey: .photoIdempotencyKey)
		try container.encode(isPrepared, forKey: .isPrepared)
		try container.encode(createItemSent, forKey: .createItemSent)
		try container.encodeIfPresent(frozenCreateItemRequest, forKey: .frozenCreateItemRequest)
		try container.encodeIfPresent(pendingUpdateFields, forKey: .pendingUpdateFields)
		try container.encodeIfPresent(uploadUrl, forKey: .uploadUrl)
		try container.encodeIfPresent(uploadHeaders, forKey: .uploadHeaders)
		try container.encode(isUploaded, forKey: .isUploaded)
		try container.encodeIfPresent(nextAttemptAt, forKey: .nextAttemptAt)
	}
}

// MARK: - Queue Implementation

/// Persistent queue for photo captures (docs/ios/api-contract.md "Uploads").
@MainActor
@Observable
public final class UploadQueue {
	/// Jobs of the active user, oldest first, including failed ones; done
	/// jobs drop out across restarts.
	public private(set) var jobs: [UploadJob] = []
	public var pendingCount: Int { jobs.filter { $0.phase != .done && $0.phase != .failed }.count }
	public var failedCount: Int { jobs.filter { $0.phase == .failed }.count }

	private let api: any WardrobeAPI
	private let store: UploadStore
	private let networkMonitor: any NetworkPathMonitoring
	private let sleeper: @Sendable (TimeInterval) async throws -> Void
	private let clock: @Sendable () -> Date
	private let random: @Sendable () -> Double
	private let maxAttempts: Int
	private let concurrency: Int
	private let backoffBase: TimeInterval

	private var currentUserSub: String?
	private var isPaused: Bool = false
	private var authRequired: Bool = false
	private var activeJobIds: Set<UUID> = []
	private var activeItemIds: Set<ID> = []
	private var wakeTask: Task<Void, Never>?
	private var networkMonitorStarted: Bool = false

	/// - Parameters:
	///   - directory: root for persisted jobs (`Application Support/uploads`).
	public convenience init(api: any WardrobeAPI, directory: URL) {
		self.init(
			api: api,
			directory: directory,
			networkMonitor: LiveNetworkPathMonitor(),
			sleeper: { seconds in try await Task.sleep(for: .seconds(seconds)) },
			clock: { Date.now },
			random: { Double.random(in: 0...1) }
		)
	}

	init(
		api: any WardrobeAPI,
		directory: URL,
		networkMonitor: any NetworkPathMonitoring = LiveNetworkPathMonitor(),
		sleeper: @escaping @Sendable (TimeInterval) async throws -> Void = { seconds in try await Task.sleep(for: .seconds(seconds)) },
		clock: @escaping @Sendable () -> Date = { Date.now },
		random: @escaping @Sendable () -> Double = { Double.random(in: 0...1) },
		concurrency: Int = 2,
		maxAttempts: Int = 8,
		backoffBase: TimeInterval = 1.0
	) {
		self.api = api
		self.store = UploadStore(directory: directory)
		self.networkMonitor = networkMonitor
		self.sleeper = sleeper
		self.clock = clock
		self.random = random
		self.concurrency = concurrency
		self.maxAttempts = maxAttempts
		self.backoffBase = backoffBase
	}

	isolated deinit {
		wakeTask?.cancel()
		networkMonitor.cancel()
	}

	// MARK: - Lifecycle

	/// Starts (or resumes) processing jobs of `userSub`; loads them from disk.
	public func start(userSub: String) {
		if currentUserSub == userSub, !isPaused {
			return
		}
		currentUserSub = userSub
		isPaused = false
		authRequired = false

		do {
			let loaded = try store.loadJobs(for: userSub)
			var refreshed: [UploadJob] = []
			for var j in loaded {
				if j.phase == .running || j.phase == .waiting {
					j.phase = .waiting
					j.nextAttemptAt = nil
				}
				refreshed.append(j)
			}
			self.jobs = refreshed
		} catch {
			self.jobs = []
		}

		startNetworkMonitorIfNeeded()
		pump()
	}

	/// Stops processing (signed out); jobs stay on disk.
	public func pause() {
		isPaused = true
		wakeTask?.cancel()
		wakeTask = nil
	}

	/// Kick the queue (became active, network came back).
	public func resume() {
		guard isPaused || authRequired || hasRetryingJobs() else { return }
		isPaused = false
		authRequired = false

		for i in jobs.indices {
			if jobs[i].phase == .waiting && jobs[i].nextAttemptAt != nil {
				jobs[i].nextAttemptAt = nil
				try? store.saveJob(jobs[i])
			}
		}

		pump()
	}

	private func startNetworkMonitorIfNeeded() {
		guard !networkMonitorStarted else { return }
		networkMonitorStarted = true
		networkMonitor.start { [weak self] isSatisfied in
			guard isSatisfied else { return }
			if Thread.isMainThread {
				MainActor.assumeIsolated {
					self?.resume()
				}
			} else {
				Task { @MainActor [weak self] in
					self?.resume()
				}
			}
		}
	}

	// MARK: - Commands

	/// Persists the capture (any image format the device produced) and
	/// queues it. Returns the job id.
	@discardableResult
	public func enqueue(imageData: Data, kind: PhotoKind, target: UploadTarget, sessionId: ID?) throws -> UUID {
		guard let userSub = currentUserSub else {
			throw APIError(status: 401, error: "not_started", message: "Upload queue has not been started with a user")
		}

		let jobId = UUID()
		let initialItemId: ID?
		if case .item(let id) = target {
			initialItemId = id
		} else {
			initialItemId = nil
		}

		let job = UploadJob(
			id: jobId,
			userSub: userSub,
			target: target,
			kind: kind,
			sessionId: sessionId,
			createdAt: clock(),
			phase: .waiting,
			step: .prepare,
			itemId: initialItemId,
			photoId: nil,
			photo: nil,
			lastError: nil,
			attempts: 0
		)

		try store.saveOriginalData(imageData, for: jobId, userSub: userSub)
		try store.saveJob(job)

		jobs.append(job)
		jobs.sort { $0.createdAt < $1.createdAt }

		pump()
		return jobId
	}

	/// Changes the quick fields of a job that creates an item; synced with
	/// PATCH /items/{id} once the item exists.
	public func updateNewItemFields(jobId: UUID, _ fields: CreateItemRequest) {
		guard let idx = jobs.firstIndex(where: { $0.id == jobId }) else { return }
		var job = jobs[idx]
		guard case .newItem(var existingCreateRequest) = job.target else { return }

		if !job.createItemSent && job.itemId == nil {
			merge(fields: fields, into: &existingCreateRequest)
			job.target = .newItem(existingCreateRequest)
			jobs[idx] = job
			try? store.saveJob(job)
		} else {
			var pending = job.pendingUpdateFields ?? CreateItemRequest()
			merge(fields: fields, into: &pending)
			job.pendingUpdateFields = pending
			if job.phase == .done {
				job.phase = .waiting
				job.step = .updateItem
			}
			jobs[idx] = job
			try? store.saveJob(job)
			pump()
		}
	}

	private func merge(fields: CreateItemRequest, into target: inout CreateItemRequest) {
		if let name = fields.name { target.name = name }
		if let categoryId = fields.categoryId { target.categoryId = categoryId }
		if let brand = fields.brand { target.brand = brand }
		if let size = fields.size { target.size = size }
		if let colors = fields.colors { target.colors = colors }
		if let pattern = fields.pattern { target.pattern = pattern }
		if let material = fields.material { target.material = material }
		if let seasons = fields.seasons { target.seasons = seasons }
		if let status = fields.status { target.status = status }
		if let locationId = fields.locationId { target.locationId = locationId }
		if let notes = fields.notes { target.notes = notes }
		if let tags = fields.tags { target.tags = tags }
		if let sessionId = fields.sessionId { target.sessionId = sessionId }
		if let ownerId = fields.ownerId { target.ownerId = ownerId }
	}

	public func retry(jobId: UUID) {
		guard let idx = jobs.firstIndex(where: { $0.id == jobId }) else { return }
		var job = jobs[idx]
		guard job.phase == .failed || job.phase == .waiting else { return }
		job.phase = .waiting
		job.attempts = 0
		job.lastError = nil
		job.nextAttemptAt = nil
		jobs[idx] = job
		try? store.saveJob(job)
		pump()
	}

	public func discard(jobId: UUID) {
		guard let idx = jobs.firstIndex(where: { $0.id == jobId }) else { return }
		let job = jobs[idx]
		jobs.remove(at: idx)
		store.deleteJobFiles(id: jobId, userSub: job.userSub)
		activeJobIds.remove(jobId)
		if let itemId = job.itemId {
			activeItemIds.remove(itemId)
		}
		pump()
	}

	/// The finished item of a job, once created (for "open item" links).
	public func itemId(of jobId: UUID) -> ID? {
		jobs.first { $0.id == jobId }?.itemId
	}

	// MARK: - Testing & Progress Waiters

	package var isIdle: Bool {
		if !activeJobIds.isEmpty { return false }
		if authRequired || isPaused { return true }
		let now = clock()
		for job in jobs {
			if job.phase == .waiting && (job.nextAttemptAt == nil || job.nextAttemptAt! <= now) {
				return false
			}
		}
		return true
	}

	package func waitForIdle() async {
		while !isIdle {
			await Task.yield()
			try? await Task.sleep(for: .milliseconds(10))
		}
	}

	// MARK: - State Machine & Queue Pumping

	private func hasRetryingJobs() -> Bool {
		jobs.contains { $0.phase == .waiting && $0.nextAttemptAt != nil }
	}

	private func job(id: UUID) -> UploadJob? {
		jobs.first { $0.id == id }
	}

	private func updateJob(id: UUID, mutate: (inout UploadJob) -> Void) {
		guard let idx = jobs.firstIndex(where: { $0.id == id }) else { return }
		mutate(&jobs[idx])
		let updated = jobs[idx]
		try? store.saveJob(updated)
	}

	private func nextStep(for job: UploadJob) -> UploadJob.Step? {
		if !job.isPrepared {
			return .prepare
		}
		if case .newItem = job.target, job.itemId == nil {
			return .createItem
		}
		if job.photoId == nil {
			return .createPhoto
		}
		if !job.isUploaded {
			return .upload
		}
		if job.photo == nil {
			return .complete
		}
		if job.pendingUpdateFields != nil, job.itemId != nil {
			return .updateItem
		}
		return nil
	}

	private func isBlocked(job: UploadJob) -> Bool {
		if let itemId = job.itemId, activeItemIds.contains(itemId) {
			return true
		}
		return false
	}

	private func isDue(job: UploadJob, now: Date) -> Bool {
		guard job.phase == .waiting else { return false }
		guard let nextAttemptAt = job.nextAttemptAt else { return true }
		return nextAttemptAt <= now
	}

	private func pump() {
		guard !isPaused, !authRequired, currentUserSub != nil else { return }
		let now = clock()

		for job in jobs {
			if activeJobIds.count >= concurrency { break }
			guard !activeJobIds.contains(job.id) else { continue }
			guard isDue(job: job, now: now) else { continue }
			guard !isBlocked(job: job) else { continue }

			activeJobIds.insert(job.id)
			if let itemId = job.itemId {
				activeItemIds.insert(itemId)
			}
			updateJob(id: job.id) { j in
				j.phase = .running
			}

			Task { [weak self, jobId = job.id] in
				await self?.run(jobId: jobId)
			}
		}

		scheduleWakeTimerIfNeeded()
	}

	private func scheduleWakeTimerIfNeeded() {
		wakeTask?.cancel()
		wakeTask = nil
		guard !isPaused, !authRequired else { return }

		var earliest: Date?
		let now = clock()
		for job in jobs where job.phase == .waiting {
			if let nextAttempt = job.nextAttemptAt, nextAttempt > now {
				if let cur = earliest {
					earliest = min(cur, nextAttempt)
				} else {
					earliest = nextAttempt
				}
			}
		}

		guard let targetDate = earliest else { return }
		let delay = max(0.01, targetDate.timeIntervalSince(now))
		wakeTask = Task { [weak self, sleeper = self.sleeper] in
			try? await sleeper(delay)
			guard !Task.isCancelled else { return }
			Task { @MainActor [weak self] in
				self?.pump()
			}
		}
	}

	private func run(jobId: UUID) async {
		defer {
			activeJobIds.remove(jobId)
			if let currentJob = job(id: jobId), let itemId = currentJob.itemId {
				activeItemIds.remove(itemId)
			}
			pump()
		}

		while true {
			guard !isPaused else { return }
			guard let current = job(id: jobId), current.phase == .running else { return }
			guard let step = nextStep(for: current) else {
				finish(jobId: jobId)
				if let after = job(id: jobId), nextStep(for: after) != nil {
					updateJob(id: jobId) { j in j.phase = .running }
					continue
				}
				return
			}

			updateJob(id: jobId) { j in
				j.step = step
			}

			do {
				try await perform(step: step, for: jobId)
			} catch {
				handleFailure(jobId: jobId, error: error)
				return
			}
		}
	}

	private func finish(jobId: UUID) {
		guard let job = job(id: jobId) else { return }
		updateJob(id: jobId) { j in
			j.phase = .done
			j.step = nil
			j.lastError = nil
			j.attempts = 0
			j.nextAttemptAt = nil
		}
		store.deleteJobFiles(id: jobId, userSub: job.userSub)
	}

	private func perform(step: UploadJob.Step, for jobId: UUID) async throws {
		guard let job = job(id: jobId) else { return }

		switch step {
		case .prepare:
			guard let originalData = try store.loadOriginalData(for: jobId, userSub: job.userSub) else {
				if let jpegData = try store.loadJPEGData(for: jobId, userSub: job.userSub), !jpegData.isEmpty {
					updateJob(id: jobId) { j in
						j.isPrepared = true
						j.step = nextStep(for: j)
						j.lastError = nil
					}
					return
				}
				throw APIError(status: 400, error: "missing_photo", message: "Photo data is missing on device")
			}
			let jpegData = try ImageResizer.convertToJPEG(data: originalData)
			try store.saveJPEGData(jpegData, for: jobId, userSub: job.userSub)
			store.deleteOriginalData(for: jobId, userSub: job.userSub)
			updateJob(id: jobId) { j in
				j.isPrepared = true
				j.step = nextStep(for: j)
				j.lastError = nil
			}

		case .createItem:
			guard case .newItem(let createRequest) = job.target else { return }
			let frozen = job.frozenCreateItemRequest ?? createRequest
			updateJob(id: jobId) { j in
				j.frozenCreateItemRequest = frozen
				j.createItemSent = true
			}
			let idempotencyKey = job.itemIdempotencyKey ?? "\(jobId.uuidString.lowercased())-item"
			let summary = try await api.createItem(frozen, idempotencyKey: idempotencyKey)
			activeItemIds.insert(summary.id)
			updateJob(id: jobId) { j in
				j.itemId = summary.id
				j.step = nextStep(for: j)
				j.lastError = nil
				j.attempts = 0
			}

		case .createPhoto:
			guard let jpegData = try store.loadJPEGData(for: jobId, userSub: job.userSub) else {
				throw APIError(status: 400, error: "missing_photo", message: "Prepared photo data is missing on device")
			}
			let photoRequest = CreatePhotoRequest(
				itemId: job.itemId,
                outfitId: { if case .outfit(let id) = job.target { return id }; return nil }(),
				kind: job.kind,
				contentType: "image/jpeg",
				size: jpegData.count
			)
			let idempotencyKey = job.photoIdempotencyKey ?? "\(jobId.uuidString.lowercased())-photo"
			let uploadDTO = try await api.createPhoto(photoRequest, idempotencyKey: idempotencyKey)
			updateJob(id: jobId) { j in
				j.photoId = uploadDTO.photo.id
				j.uploadUrl = uploadDTO.uploadUrl
				j.uploadHeaders = uploadDTO.uploadHeaders
				j.step = nextStep(for: j)
				j.lastError = nil
				j.attempts = 0
			}

		case .upload:
			guard let jpegData = try store.loadJPEGData(for: jobId, userSub: job.userSub) else {
				throw APIError(status: 400, error: "missing_photo", message: "Prepared photo data is missing on device")
			}
			guard let uploadUrl = job.uploadUrl else {
				throw APIError(status: 400, error: "missing_upload_url", message: "Upload URL is missing")
			}
			do {
				try await api.uploadPhoto(jpegData, to: uploadUrl, headers: job.uploadHeaders ?? [:])
			} catch let error as APIError where error.error == "upload_expired" || error.status == 403 || error.status == 400 {
				updateJob(id: jobId) { j in
					j.photoId = nil
					j.uploadUrl = nil
					j.uploadHeaders = nil
					j.step = .createPhoto
				}
				throw APIError(status: 403, error: "upload_expired", message: "Upload URL expired, requesting fresh URL")
			}
			updateJob(id: jobId) { j in
				j.isUploaded = true
				j.step = nextStep(for: j)
				j.lastError = nil
				j.attempts = 0
			}

		case .complete:
			guard let photoId = job.photoId else {
				throw APIError(status: 400, error: "missing_photo_id", message: "Photo ID is missing")
			}
			let photoDTO: PhotoDTO
			do {
				photoDTO = try await api.completePhoto(id: photoId)
			} catch let error as APIError where error.status == 422 {
				updateJob(id: jobId) { j in
					j.isUploaded = false
					j.step = .upload
				}
				throw APIError(status: 422, error: "upload_missing", message: "Photo not found on server, uploading again")
			}
			updateJob(id: jobId) { j in
				j.photo = photoDTO
				j.step = nextStep(for: j)
				j.lastError = nil
				j.attempts = 0
			}

		case .updateItem:
			guard let itemId = job.itemId else {
				throw APIError(status: 400, error: "missing_item_id", message: "Item ID is missing")
			}
			guard let pending = job.pendingUpdateFields else { return }
			var update = UpdateItemRequest()
			if let name = pending.name { update.name = .value(name.trimmingCharacters(in: .whitespacesAndNewlines)) }
			if let categoryId = pending.categoryId { update.categoryId = .value(categoryId) }
			if let brand = pending.brand { update.brand = .value(brand) }
			if let size = pending.size { update.size = .value(size) }
			if let colors = pending.colors { update.colors = colors }
			if let pattern = pending.pattern { update.pattern = .value(pattern) }
			if let material = pending.material { update.material = .value(material) }
			if let seasons = pending.seasons { update.seasons = seasons }
			if let status = pending.status { update.status = status }
			if let locationId = pending.locationId { update.locationId = .value(locationId) }
			if let notes = pending.notes { update.notes = .value(notes) }
			if let tags = pending.tags { update.tags = tags }
			if let sessionId = pending.sessionId { update.sessionId = sessionId }

			_ = try await api.updateItem(id: itemId, update)
			updateJob(id: jobId) { j in
				j.pendingUpdateFields = nil
				j.step = nextStep(for: j)
				j.lastError = nil
				j.attempts = 0
			}
		}
	}

	private func handleFailure(jobId: UUID, error: Error) {
		if error is CancellationError {
			return
		}
		guard let current = job(id: jobId) else { return }
		let apiError = error as? APIError

		if let apiError, apiError.isSignedOut || apiError.error == APIError.signedOut.error {
			authRequired = true
			updateJob(id: jobId) { j in
				j.phase = .waiting
				j.lastError = apiError.message
			}
			pause()
			return
		}

		let attempts = current.attempts + 1
		let isRetryable = (apiError?.isRetryable == true
			|| (error as? URLError) != nil
			|| apiError?.error == "upload_expired"
			|| apiError?.error == "upload_missing")
			&& attempts < maxAttempts

		if isRetryable {
			let delay: TimeInterval
			if let retryAfter = apiError?.retryAfter, retryAfter > 0 {
				delay = retryAfter
			} else {
				delay = backoffDelay(attempt: attempts, random: random, base: backoffBase)
			}
			let nextDate = clock().addingTimeInterval(delay)
			updateJob(id: jobId) { j in
				j.phase = .waiting
				j.attempts = attempts
				j.nextAttemptAt = nextDate
				j.lastError = apiError?.message ?? error.localizedDescription
			}
		} else {
			updateJob(id: jobId) { j in
				j.phase = .failed
				j.attempts = attempts
				j.nextAttemptAt = nil
				j.lastError = apiError?.message ?? error.localizedDescription
			}
		}
	}
}

// MARK: - Backoff Helper

/// Exponential backoff with jitter: ~1 s, 2 s, 4 s … capped at `max`.
func backoffDelay(
	attempt: Int,
	random: () -> Double = { Double.random(in: 0...1) },
	base: TimeInterval = 1.0,
	max: TimeInterval = 60.0
) -> TimeInterval {
	let power = pow(2.0, Double(Swift.max(0, attempt - 1)))
	let exp = min(max, base * power)
	let jitter = 0.5 + (random() / 2.0)
	return exp * jitter
}
