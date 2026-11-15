import Foundation
import Testing

@testable import WardrobeKit

private final class OutfitURLProtocol: URLProtocol, @unchecked Sendable {
	override class func canInit(with request: URLRequest) -> Bool { true }
	override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
	override func startLoading() {
		let valid =
			request.value(forHTTPHeaderField: "Authorization") == "Bearer test"
			&& request.url?.path == "/api/immich/assets/a/thumb"
		let response = HTTPURLResponse(
			url: request.url!, statusCode: valid ? 200 : 400, httpVersion: nil,
			headerFields: ["Content-Type": "image/jpeg"])!
		client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
		client?.urlProtocol(self, didLoad: Data([1, 2, 3]))
		client?.urlProtocolDidFinishLoading(self)
	}
	override func stopLoading() {}
}

@Suite struct OutfitLiveTests {
	@Test func imageBytesUseBearer() async throws {
		let config = URLSessionConfiguration.ephemeral
		config.protocolClasses = [OutfitURLProtocol.self]
		let api = LiveWardrobeAPI(
			baseURL: URL(string: "https://wardrobe.example")!, tokens: StaticTokenProvider(token: "test"),
			configuration: config)
		#expect(try await api.immichThumbnail(assetId: "a") == Data([1, 2, 3]))
	}
}
