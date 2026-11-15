import Foundation

/// Loads photo variants: resolves the presigned URL through the API, fetches
/// it without auth, caches bytes on disk and in memory
/// (docs/ios/api-contract.md "Photos"). Shell from WP0; WP4 implements it.
public actor ImagePipeline {
	public init(api: any WardrobeAPI, cacheDirectory: URL, maxDiskBytes: Int = 500 * 1024 * 1024) {}

	/// Image bytes of a ready photo's variant; nil while not ready (404).
	public func data(photoId: ID, variant: PhotoVariant) async throws -> Data? { nil }

	public func clear() async {}
}
