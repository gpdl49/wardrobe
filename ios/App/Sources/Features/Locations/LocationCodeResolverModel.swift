import Foundation
import Observation
import WardrobeKit

/// Model resolving a QR label (`/l/<ownerId>/<code>`) into a `LocationDTO`.
@MainActor
@Observable
public final class LocationCodeResolverModel {
	public enum State: Equatable {
		case loading
		case resolved(LocationDTO)
		case notFound(canCreate: Bool)
		case error(String)
	}

	public let api: any WardrobeAPI
	public let ownerId: ID
	public let code: String
	public let myId: ID?

	public private(set) var state: State = .loading
	weak var appModel: AppModel?

	public init(api: any WardrobeAPI, ownerId: ID, code: String, myId: ID?) {
		self.api = api
		self.ownerId = ownerId
		self.code = code
		self.myId = myId
	}

	/// Resolves the location by calling `location(code:owner:)`.
	public func resolve() async {
		state = .loading
		do {
			let loc = try await api.location(code: code, owner: ownerId)
			state = .resolved(loc)
		} catch {
			if APIErrorStatus.status(of: error) == 404 {
				let isMine = myId != nil && ownerId == myId
				state = .notFound(canCreate: isMine)
			} else {
				if let message = userFacingAPIError(error, appModel: appModel) { state = .error(message) }
			}
		}
	}

	/// Manually sets the resolved location (e.g. after creating it).
	public func setResolved(_ location: LocationDTO) {
		state = .resolved(location)
	}
}
