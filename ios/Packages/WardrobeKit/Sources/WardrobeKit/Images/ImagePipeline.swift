import Foundation

/// Loads photo variants: resolves the presigned URL through the API, fetches
/// it without auth, caches bytes on disk and in memory
/// (docs/ios/api-contract.md "Photos").
public actor ImagePipeline {
	private struct CachedURL: Sendable {
		let url: URL
		let timestamp: Date
	}

	private let api: any WardrobeAPI
	private let cacheDirectory: URL
	private let maxDiskBytes: Int
	private let session: URLSession

	private let memoryCache: NSCache<NSString, NSData>
	private var urlCache: [String: CachedURL] = [:]
	private var inFlight: [String: Task<Data?, any Error>] = [:]

	public init(
		api: any WardrobeAPI,
		cacheDirectory: URL,
		maxDiskBytes: Int = 500 * 1024 * 1024,
		session: URLSession = .shared
	) {
		self.api = api
		self.cacheDirectory = cacheDirectory
		self.maxDiskBytes = maxDiskBytes
		self.session = session

		let cache = NSCache<NSString, NSData>()
		cache.countLimit = 200
		cache.totalCostLimit = 50 * 1024 * 1024 // 50 MB
		self.memoryCache = cache

		try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
	}

	/// Image bytes of a ready photo's variant; nil while not ready (404).
	public func data(photoId: ID, variant: PhotoVariant) async throws -> Data? {
		let key = cacheKey(photoId: photoId, variant: variant)

		// 1. Check in-memory cache
		if let cachedData = memoryCache.object(forKey: key as NSString) {
			return cachedData as Data
		}

		// 2. Check disk cache
		let filePath = diskPath(photoId: photoId, variant: variant)
		if FileManager.default.fileExists(atPath: filePath.path()) {
			if let diskData = try? Data(contentsOf: filePath) {
				memoryCache.setObject(diskData as NSData, forKey: key as NSString, cost: diskData.count)
				touchFile(at: filePath)
				return diskData
			}
		}

		// 3. De-duplicate in-flight requests
		if let runningTask = inFlight[key] {
			return try await runningTask.value
		}

		let task = Task<Data?, any Error> { [weak self] in
			guard let self else { return nil }
			return try await self.fetchAndCache(photoId: photoId, variant: variant, key: key)
		}

		inFlight[key] = task
		defer { inFlight[key] = nil }

		return try await task.value
	}

	/// Clears in-memory, disk, and in-flight caches.
	public func clear() async {
		memoryCache.removeAllObjects()
		urlCache.removeAll()
		inFlight.removeAll()

		if FileManager.default.fileExists(atPath: cacheDirectory.path()) {
			try? FileManager.default.removeItem(at: cacheDirectory)
		}
		try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
	}

	// MARK: - Private Helpers

	private func cacheKey(photoId: ID, variant: PhotoVariant) -> String {
		"\(photoId)/\(variant.rawValue)"
	}

	private func diskPath(photoId: ID, variant: PhotoVariant) -> URL {
		cacheDirectory.appending(path: photoId).appending(path: variant.rawValue)
	}

	private func fetchAndCache(photoId: ID, variant: PhotoVariant, key: String) async throws -> Data? {
		// Resolve presigned URL (cached ≤ 4 minutes)
		guard let presignedURL = try await resolvePresignedURL(photoId: photoId, variant: variant, key: key) else {
			return nil
		}

		// Fetch from presigned URL without auth headers
		var request = URLRequest(url: presignedURL)
		request.httpMethod = "GET"
		request.timeoutInterval = 30

		var (data, response): (Data, URLResponse)
		do {
			(data, response) = try await session.data(for: request)
		} catch {
			throw APIError(status: 0, error: "network", message: error.localizedDescription)
		}

		guard let http = response as? HTTPURLResponse else {
			return nil
		}

		if http.statusCode == 403 {
			// S3 expired URL: invalidate cached URL and retry once with fresh URL
			urlCache.removeValue(forKey: key)
			guard let freshURL = try await resolvePresignedURL(photoId: photoId, variant: variant, key: key) else {
				return nil
			}

			var retryRequest = URLRequest(url: freshURL)
			retryRequest.httpMethod = "GET"
			retryRequest.timeoutInterval = 30

			do {
				(data, response) = try await session.data(for: retryRequest)
			} catch {
				throw APIError(status: 0, error: "network", message: error.localizedDescription)
			}

			guard let retryHttp = response as? HTTPURLResponse else {
				return nil
			}

			if retryHttp.statusCode == 404 {
				return nil
			}
			guard retryHttp.statusCode >= 200 && retryHttp.statusCode < 300 else {
				throw APIError(status: retryHttp.statusCode, error: "http_\(retryHttp.statusCode)", message: "Photo fetch failed")
			}
		} else if http.statusCode == 404 {
			return nil
		} else if http.statusCode < 200 || http.statusCode >= 300 {
			throw APIError(status: http.statusCode, error: "http_\(http.statusCode)", message: "Photo fetch failed")
		}

		// Save to memory cache
		memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)

		// Save to disk cache
		let filePath = diskPath(photoId: photoId, variant: variant)
		let dir = filePath.deletingLastPathComponent()
		try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
		try? data.write(to: filePath, options: .atomic)
		touchFile(at: filePath)

		// Evict if over disk limit
		evictDiskCacheIfNeeded()

		return data
	}

	private func resolvePresignedURL(photoId: ID, variant: PhotoVariant, key: String) async throws -> URL? {
		let now = Date()
		if let cached = urlCache[key], now.timeIntervalSince(cached.timestamp) < 240 {
			return cached.url
		}

		guard let url = try await api.photoURL(id: photoId, variant: variant) else {
			return nil
		}

		urlCache[key] = CachedURL(url: url, timestamp: now)
		return url
	}

	private func touchFile(at url: URL) {
		try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path())
	}

	private func evictDiskCacheIfNeeded() {
		guard maxDiskBytes > 0 else { return }
		let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
		guard let enumerator = FileManager.default.enumerator(
			at: cacheDirectory,
			includingPropertiesForKeys: keys,
			options: [.skipsHiddenFiles]
		) else { return }

		struct FileMeta {
			let url: URL
			let size: Int
			let modified: Date
		}

		var files: [FileMeta] = []
		var totalSize = 0

		for case let fileURL as URL in enumerator {
			guard let values = try? fileURL.resourceValues(forKeys: Set(keys)),
				values.isRegularFile == true,
				let size = values.fileSize else { continue }
			let modified = values.contentModificationDate ?? .distantPast
			files.append(FileMeta(url: fileURL, size: size, modified: modified))
			totalSize += size
		}

		guard totalSize > maxDiskBytes else { return }

		// Sort oldest modification date first
		files.sort { $0.modified < $1.modified }

		let targetSize = Int(Double(maxDiskBytes) * 0.8)
		for file in files {
			if totalSize <= targetSize { break }
			try? FileManager.default.removeItem(at: file.url)
			totalSize -= file.size
		}
	}
}
