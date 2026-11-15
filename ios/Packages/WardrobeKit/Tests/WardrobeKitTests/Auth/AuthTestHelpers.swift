import Foundation
@testable import WardrobeKit

// MARK: - Mock JWT Builder

func makeTestJWT(
	sub: String = "usr_test123",
	email: String? = "test@vidur.xyz",
	preferredUsername: String? = "testuser",
	groups: [String] = ["wardrobe"],
	iss: String = "https://z.vidur.xyz",
	aud: [String] = ["wardrobe-ios"],
	exp: TimeInterval = Date.now.addingTimeInterval(3600).timeIntervalSince1970,
	nonce: String? = nil
) -> String {
	let header = "{\"alg\":\"none\",\"typ\":\"JWT\"}".data(using: .utf8)!.base64URLEncodedString()
	var payloadDict: [String: Any] = [
		"sub": sub,
		"iss": iss,
		"exp": exp,
		"groups": groups,
	]
	if aud.count == 1 {
		payloadDict["aud"] = aud[0]
	} else {
		payloadDict["aud"] = aud
	}
	if let email { payloadDict["email"] = email }
	if let preferredUsername { payloadDict["preferred_username"] = preferredUsername }
	if let nonce { payloadDict["nonce"] = nonce }

	let payloadData = try! JSONSerialization.data(withJSONObject: payloadDict, options: [.sortedKeys])
	let payload = payloadData.base64URLEncodedString()
	return "\(header).\(payload).signature"
}

// MARK: - Request Body Helper

func readRequestBody(from request: URLRequest) -> Data {
	if let data = request.httpBody { return data }
	if let stream = request.httpBodyStream {
		stream.open()
		defer { stream.close() }
		var data = Data()
		let bufferSize = 1024
		let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
		defer { buffer.deallocate() }
		while stream.hasBytesAvailable {
			let read = stream.read(buffer, maxLength: bufferSize)
			if read > 0 {
				data.append(buffer, count: read)
			} else {
				break
			}
		}
		return data
	}
	return Data()
}

// MARK: - Test Auth Presenter

@MainActor
final class TestAuthPresenter: AuthPresenter {
	var onAuthenticate: (@MainActor (URL, String) throws -> URL)?
	var lastPresentedURL: URL?
	var lastCallbackScheme: String?

	init(onAuthenticate: (@MainActor (URL, String) throws -> URL)? = nil) {
		self.onAuthenticate = onAuthenticate
	}

	init(result: Result<URL, any Error>) {
		self.onAuthenticate = { _, _ in try result.get() }
	}

	func authenticate(url: URL, callbackScheme: String) async throws -> URL {
		lastPresentedURL = url
		lastCallbackScheme = callbackScheme
		if let onAuthenticate {
			return try onAuthenticate(url, callbackScheme)
		}
		throw CancellationError()
	}
}

// MARK: - URLProtocol Stub

final class AuthURLProtocolStub: URLProtocol, @unchecked Sendable {
	typealias Handler = @Sendable (URLRequest) throws -> (HTTPURLResponse, Data)

	private final class Storage: @unchecked Sendable {
		static let shared = Storage()
		private let lock = NSLock()
		var handlers: [String: Handler] = [:]
		var requestCounts: [String: Int] = [:]
		var delays: [String: TimeInterval] = [:]

		func setHandler(forHost host: String, handler: @escaping Handler) {
			lock.withLock {
				handlers[host] = handler
			}
		}

		func setDelay(_ delay: TimeInterval, forHost host: String) {
			lock.withLock {
				delays[host] = delay
			}
		}

		func requestCount(forHost host: String) -> Int {
			lock.withLock {
				requestCounts[host] ?? 0
			}
		}

		func recordRequest(forHost host: String) -> (Handler?, TimeInterval) {
			lock.withLock {
				requestCounts[host, default: 0] += 1
				return (handlers[host], delays[host] ?? 0)
			}
		}
	}

	static func setHandler(forHost host: String, handler: @escaping Handler) {
		Storage.shared.setHandler(forHost: host, handler: handler)
	}

	static func setDelay(_ delay: TimeInterval, forHost host: String) {
		Storage.shared.setDelay(delay, forHost: host)
	}

	static func requestCount(forHost host: String) -> Int {
		Storage.shared.requestCount(forHost: host)
	}

	override class func canInit(with request: URLRequest) -> Bool {
		true
	}

	override class func canonicalRequest(for request: URLRequest) -> URLRequest {
		request
	}

	override func startLoading() {
		let host = request.url?.host ?? ""
		let (handler, delay) = Storage.shared.recordRequest(forHost: host)

		Task {
			if delay > 0 {
				try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
			}

			guard let handler else {
				let notFound = HTTPURLResponse(
					url: request.url ?? URL(string: "https://example.com")!,
					statusCode: 404,
					httpVersion: nil,
					headerFields: nil
				)!
				client?.urlProtocol(self, didReceive: notFound, cacheStoragePolicy: .notAllowed)
				client?.urlProtocol(self, didLoad: Data())
				client?.urlProtocolDidFinishLoading(self)
				return
			}

			do {
				let (response, data) = try handler(request)
				client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
				client?.urlProtocol(self, didLoad: data)
				client?.urlProtocolDidFinishLoading(self)
			} catch {
				client?.urlProtocol(self, didFailWithError: error)
			}
		}
	}

	override func stopLoading() {}

	static func makeStubbedSession() -> URLSession {
		let config = URLSessionConfiguration.ephemeral
		config.protocolClasses = [AuthURLProtocolStub.self]
		return URLSession(configuration: config)
	}
}
