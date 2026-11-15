import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit
import WardrobeKitTesting

@MainActor
@Suite struct SettingsTests {
	// MARK: - Test Doubles

	final class MockUploadQueue: UploadQueueProviding {
		var pendingCount: Int = 0
		var failedCount: Int = 0
		var failedJobs: [UploadJob] = []

		var retriedIDs: [UUID] = []
		var discardedIDs: [UUID] = []

		func retry(jobId: UUID) {
			retriedIDs.append(jobId)
		}

		func discard(jobId: UUID) {
			discardedIDs.append(jobId)
		}
	}

	// MARK: - Upload Counts Tests

	@Test func settingsCountsReflectUploadQueueMetrics() {
		let mockUploads = MockUploadQueue()
		mockUploads.pendingCount = 4
		mockUploads.failedCount = 2

		let job1 = UploadJob(
			id: UUID(),
			userSub: "sub-1",
			target: .newItem(CreateItemRequest(name: "Linen shirt")),
			kind: .main,
			phase: .failed,
			lastError: "Network connection lost"
		)
		let job2 = UploadJob(
			id: UUID(),
			userSub: "sub-1",
			target: .item("item-2"),
			kind: .detail,
			phase: .failed,
			lastError: "Server 500 error"
		)
		mockUploads.failedJobs = [job1, job2]

		let images = ImagePipeline(api: FixtureWardrobeAPI(), cacheDirectory: URL.temporaryDirectory)
		let vm = SettingsModel(uploads: mockUploads, images: images)

		#expect(vm.pendingCount == 4)
		#expect(vm.failedCount == 2)
		#expect(vm.failedJobs.count == 2)
		#expect(vm.failedJobs[0].lastError == "Network connection lost")
		#expect(vm.failedJobs[1].lastError == "Server 500 error")
	}

	@Test func retryAndDiscardDelegateToUploadQueue() {
		let mockUploads = MockUploadQueue()
		let jobID = UUID()

		let images = ImagePipeline(api: FixtureWardrobeAPI(), cacheDirectory: URL.temporaryDirectory)
		let vm = SettingsModel(uploads: mockUploads, images: images)

		vm.retryJob(id: jobID)
		#expect(mockUploads.retriedIDs == [jobID])

		vm.discardJob(id: jobID)
		#expect(mockUploads.discardedIDs == [jobID])
	}

	// MARK: - Cache Clearing Tests

	@Test func clearImageCacheUpdatesStatus() async {
		let mockUploads = MockUploadQueue()
		let images = ImagePipeline(api: FixtureWardrobeAPI(), cacheDirectory: URL.temporaryDirectory)
		let vm = SettingsModel(uploads: mockUploads, images: images)

		#expect(!vm.cacheCleared)
		await vm.clearImageCache()
		#expect(vm.cacheCleared)
		#expect(!vm.isClearingCache)
	}

	// MARK: - Version String Tests

	@Test func versionStringIsNonEmpty() {
		let mockUploads = MockUploadQueue()
		let images = ImagePipeline(api: FixtureWardrobeAPI(), cacheDirectory: URL.temporaryDirectory)
		let vm = SettingsModel(uploads: mockUploads, images: images)

		#expect(!vm.versionString.isEmpty)
	}
}
