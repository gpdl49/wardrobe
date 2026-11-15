import Foundation
import Observation
import WardrobeKit

/// Protocol abstracting upload queue metrics and actions for `SettingsModel`.
@MainActor
protocol UploadQueueProviding: AnyObject {
	var pendingCount: Int { get }
	var failedCount: Int { get }
	var failedJobs: [UploadJob] { get }
	func retry(jobId: UUID)
	func discard(jobId: UUID)
}

extension UploadQueue: UploadQueueProviding {
	var failedJobs: [UploadJob] {
		jobs.filter { $0.phase == .failed }
	}
}

/// State and helpers for `SettingsView` (WP8).
@MainActor
@Observable
final class SettingsModel {
	// MARK: - State

	var isClearingCache: Bool = false
	var cacheCleared: Bool = false
	var showSignOutConfirmation: Bool = false

	private let uploads: any UploadQueueProviding
	private let images: ImagePipeline

	// MARK: - Initialization

	init(uploads: any UploadQueueProviding, images: ImagePipeline) {
		self.uploads = uploads
		self.images = images
	}

	// MARK: - Uploads Info

	var pendingCount: Int {
		uploads.pendingCount
	}

	var failedCount: Int {
		uploads.failedCount
	}

	var failedJobs: [UploadJob] {
		uploads.failedJobs
	}

	func retryJob(id: UUID) {
		uploads.retry(jobId: id)
	}

	func discardJob(id: UUID) {
		uploads.discard(jobId: id)
	}

	// MARK: - Cache

	func clearImageCache() async {
		isClearingCache = true
		await images.clear()
		isClearingCache = false
		cacheCleared = true
	}

	// MARK: - Version Info

	var versionString: String {
		let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
		let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
		return "\(version) (\(build))"
	}
}
