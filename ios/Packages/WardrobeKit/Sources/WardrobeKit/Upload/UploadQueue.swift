import Foundation
import Observation

/// What a capture should become.
public enum UploadTarget: Codable, Hashable, Sendable {
	/// Add the photo to an existing item.
	case item(ID)
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
	}
}

/// Persistent queue for photo captures (docs/ios/api-contract.md "Uploads").
/// Shell from WP0; WP3 implements it — the public API below is the contract.
@MainActor
@Observable
public final class UploadQueue {
	/// Jobs of the active user, oldest first, including failed ones; done
	/// jobs drop out.
	public private(set) var jobs: [UploadJob] = []
	public var pendingCount: Int { jobs.filter { $0.phase != .done && $0.phase != .failed }.count }
	public var failedCount: Int { jobs.filter { $0.phase == .failed }.count }

	/// - Parameters:
	///   - directory: root for persisted jobs (`Application Support/uploads`).
	public init(api: any WardrobeAPI, directory: URL) {}

	/// Starts (or resumes) processing jobs of `userSub`; loads them from disk.
	public func start(userSub: String) {}
	/// Stops processing (signed out); jobs stay on disk.
	public func pause() {}
	/// Kick the queue (became active, network came back).
	public func resume() {}

	/// Persists the capture (any image format the device produced) and
	/// queues it. Returns the job id.
	@discardableResult
	public func enqueue(imageData: Data, kind: PhotoKind, target: UploadTarget, sessionId: ID?) throws -> UUID {
		UUID()
	}

	/// Changes the quick fields of a job that creates an item; synced with
	/// PATCH /items/{id} once the item exists.
	public func updateNewItemFields(jobId: UUID, _ fields: CreateItemRequest) {}

	public func retry(jobId: UUID) {}
	public func discard(jobId: UUID) {}

	/// The finished item of a job, once created (for "open item" links).
	public func itemId(of jobId: UUID) -> ID? { jobs.first { $0.id == jobId }?.itemId }
}
