import Foundation
import WardrobeKit

/// A session in progress on this device, preserved across app relaunches.
public struct ActiveSession: Codable, Hashable, Sendable {
	public var session: PackingSessionDTO
	public var location: LocationRef
	public var idempotencyKey: String

	public init(session: PackingSessionDTO, location: LocationRef, idempotencyKey: String) {
		self.session = session
		self.location = location
		self.idempotencyKey = idempotencyKey
	}
}

/// Manages persistence of active packing and unpacking sessions.
@MainActor
public final class ActiveSessionStore: Sendable {
	private let defaults: UserDefaults

	public init(defaults: UserDefaults = .standard) {
		self.defaults = defaults
	}

	private func storageKey(userSub: String, mode: SessionMode) -> String {
		"wardrobe.session.\(userSub).\(mode.rawValue)"
	}

	public func load(userSub: String, mode: SessionMode) -> ActiveSession? {
		guard let data = defaults.data(forKey: storageKey(userSub: userSub, mode: mode)) else { return nil }
		return try? JSONDecoder.wardrobe.decode(ActiveSession.self, from: data)
	}

	public func save(userSub: String, mode: SessionMode, active: ActiveSession) {
		if let data = try? JSONEncoder.wardrobe.encode(active) {
			defaults.set(data, forKey: storageKey(userSub: userSub, mode: mode))
		}
	}

	public func clear(userSub: String, mode: SessionMode) {
		defaults.removeObject(forKey: storageKey(userSub: userSub, mode: mode))
	}
}
