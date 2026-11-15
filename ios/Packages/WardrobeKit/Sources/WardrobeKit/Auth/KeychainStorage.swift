import Foundation
import Security

// MARK: - StoredAuthTokens

/// The tokens persisted in the Keychain.
public struct StoredAuthTokens: Codable, Hashable, Sendable {
	public var idToken: String
	public var refreshToken: String?
	public var expiresAt: Date

	public init(idToken: String, refreshToken: String?, expiresAt: Date) {
		self.idToken = idToken
		self.refreshToken = refreshToken
		self.expiresAt = expiresAt
	}
}

// MARK: - KeychainStorage Protocol

/// Abstraction for storing tokens, enabling in-memory storage for unit testing.
public protocol KeychainStorage: Sendable {
	func readTokens() throws -> StoredAuthTokens?
	func saveTokens(_ tokens: StoredAuthTokens) throws
	func clearTokens() throws
}

// MARK: - LiveKeychainStorage

/// Production Keychain storage conforming to docs/ios/api-contract.md "Authentication":
/// - `kSecClassGenericPassword`
/// - Service `xyz.vidur.wardrobe.auth`
/// - `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
public final class LiveKeychainStorage: KeychainStorage, Sendable {
	public let service: String
	public let account: String

	public init(service: String = "xyz.vidur.wardrobe.auth", account: String = "session") {
		self.service = service
		self.account = account
	}

	public func readTokens() throws -> StoredAuthTokens? {
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: account,
			kSecReturnData as String: true,
			kSecMatchLimit as String: kSecMatchLimitOne,
		]
		var item: CFTypeRef?
		let status = SecItemCopyMatching(query as CFDictionary, &item)
		if status == errSecItemNotFound {
			return nil
		}
		guard status == errSecSuccess, let data = item as? Data else {
			throw KeychainError(status: status)
		}
		return try JSONDecoder().decode(StoredAuthTokens.self, from: data)
	}

	public func saveTokens(_ tokens: StoredAuthTokens) throws {
		let data = try JSONEncoder().encode(tokens)
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: account,
		]
		let attributes: [String: Any] = [
			kSecValueData as String: data,
			kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
		]

		let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
		if updateStatus == errSecSuccess {
			return
		}

		if updateStatus == errSecItemNotFound {
			var addQuery = query
			addQuery[kSecValueData as String] = data
			addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
			let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
			guard addStatus == errSecSuccess else {
				throw KeychainError(status: addStatus)
			}
		} else {
			throw KeychainError(status: updateStatus)
		}
	}

	public func clearTokens() throws {
		let query: [String: Any] = [
			kSecClass as String: kSecClassGenericPassword,
			kSecAttrService as String: service,
			kSecAttrAccount as String: account,
		]
		let status = SecItemDelete(query as CFDictionary)
		if status != errSecSuccess && status != errSecItemNotFound {
			throw KeychainError(status: status)
		}
	}
}

// MARK: - InMemoryKeychainStorage

/// In-memory storage for unit tests.
public final class InMemoryKeychainStorage: KeychainStorage, @unchecked Sendable {
	private let lock = NSLock()
	private var stored: StoredAuthTokens?

	public init(initialTokens: StoredAuthTokens? = nil) {
		self.stored = initialTokens
	}

	public func readTokens() throws -> StoredAuthTokens? {
		lock.withLock { stored }
	}

	public func saveTokens(_ tokens: StoredAuthTokens) throws {
		lock.withLock { stored = tokens }
	}

	public func clearTokens() throws {
		lock.withLock { stored = nil }
	}
}
