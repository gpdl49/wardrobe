import Foundation

/// Manages on-disk persistence for upload jobs and image files under `directory/<userSub>/`.
final class UploadStore: Sendable {
	let directory: URL

	init(directory: URL) {
		self.directory = directory
	}

	func userDirectory(for userSub: String) -> URL {
		directory.appending(path: userSub)
	}

	func jobFileURL(id: UUID, userSub: String) -> URL {
		userDirectory(for: userSub).appending(path: "\(id.uuidString.lowercased()).json")
	}

	func originalFileURL(id: UUID, userSub: String) -> URL {
		userDirectory(for: userSub).appending(path: "\(id.uuidString.lowercased()).original")
	}

	func jpegFileURL(id: UUID, userSub: String) -> URL {
		userDirectory(for: userSub).appending(path: "\(id.uuidString.lowercased()).jpg")
	}

	private func ensureDirectoryExists(for userSub: String) throws {
		let dir = userDirectory(for: userSub)
		try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
	}

	func saveJob(_ job: UploadJob) throws {
		try ensureDirectoryExists(for: job.userSub)
		let data = try JSONEncoder.wardrobe.encode(job)
		let url = jobFileURL(id: job.id, userSub: job.userSub)
		try data.write(to: url, options: .atomic)
	}

	func loadJobs(for userSub: String) throws -> [UploadJob] {
		let dir = userDirectory(for: userSub)
		guard FileManager.default.fileExists(atPath: dir.path(percentEncoded: false)) else {
			return []
		}
		let urls = try FileManager.default.contentsOfDirectory(
			at: dir,
			includingPropertiesForKeys: nil,
			options: .skipsHiddenFiles
		)
		var jobs: [UploadJob] = []
		for url in urls where url.pathExtension == "json" {
			do {
				let data = try Data(contentsOf: url)
				let job = try JSONDecoder.wardrobe.decode(UploadJob.self, from: data)
				jobs.append(job)
			} catch {
				// Skip corrupt or unreadable files
			}
		}
		return jobs.sorted { a, b in
			if a.createdAt != b.createdAt {
				return a.createdAt < b.createdAt
			}
			return a.id.uuidString < b.id.uuidString
		}
	}

	func saveOriginalData(_ data: Data, for jobId: UUID, userSub: String) throws {
		try ensureDirectoryExists(for: userSub)
		let url = originalFileURL(id: jobId, userSub: userSub)
		try data.write(to: url, options: .atomic)
	}

	func loadOriginalData(for jobId: UUID, userSub: String) throws -> Data? {
		let url = originalFileURL(id: jobId, userSub: userSub)
		guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else {
			return nil
		}
		return try Data(contentsOf: url)
	}

	func deleteOriginalData(for jobId: UUID, userSub: String) {
		let url = originalFileURL(id: jobId, userSub: userSub)
		try? FileManager.default.removeItem(at: url)
	}

	func saveJPEGData(_ data: Data, for jobId: UUID, userSub: String) throws {
		try ensureDirectoryExists(for: userSub)
		let url = jpegFileURL(id: jobId, userSub: userSub)
		try data.write(to: url, options: .atomic)
	}

	func loadJPEGData(for jobId: UUID, userSub: String) throws -> Data? {
		let url = jpegFileURL(id: jobId, userSub: userSub)
		guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else {
			return nil
		}
		return try Data(contentsOf: url)
	}

	func deleteJPEGData(for jobId: UUID, userSub: String) {
		let url = jpegFileURL(id: jobId, userSub: userSub)
		try? FileManager.default.removeItem(at: url)
	}

	func deleteJobFiles(id: UUID, userSub: String) {
		let jsonURL = jobFileURL(id: id, userSub: userSub)
		try? FileManager.default.removeItem(at: jsonURL)
		deleteOriginalData(for: id, userSub: userSub)
		deleteJPEGData(for: id, userSub: userSub)
	}
}
