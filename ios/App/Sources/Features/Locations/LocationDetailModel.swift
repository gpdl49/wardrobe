import Foundation
import Observation
import WardrobeKit

/// Manages fetching, updating, archiving, deleting, and moving items within a single location.
@MainActor
@Observable
public final class LocationDetailModel {
	public let api: any WardrobeAPI
	public let locationId: ID

	public private(set) var detail: LocationDetailDTO?
	public private(set) var parentLocation: LocationDTO?
	public private(set) var isLoading: Bool = false
	public var errorMessage: String?
	public private(set) var isDeleted: Bool = false

	// Multi-select for moving items
	public var isSelectingItems: Bool = false
	public var selectedItemIds: Set<ID> = []

	public init(api: any WardrobeAPI, locationId: ID) {
		self.api = api
		self.locationId = locationId
	}

	public var canEdit: Bool {
		detail?.access != .view
	}

	/// Fetches the location detail and parent info.
	public func load() async {
		isLoading = true
		errorMessage = nil
		defer { isLoading = false }

		do {
			let d = try await api.location(id: locationId)
			self.detail = d

			if let parentId = d.parentId {
				// Attempt to fetch parent for display
				let parents = try? await api.locations(LocationQuery(owner: d.ownerId, archived: true))
				self.parentLocation = parents?.first(where: { $0.id == parentId })
			} else {
				self.parentLocation = nil
			}
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}

	/// Archives the location.
	public func archive() async {
		do {
			var req = UpdateLocationRequest()
			req.archivedAt = .value(Date())
			_ = try await api.updateLocation(id: locationId, req)
			await load()
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}

	/// Restores an archived location.
	public func restore() async {
		do {
			var req = UpdateLocationRequest()
			req.archivedAt = .null
			_ = try await api.updateLocation(id: locationId, req)
			await load()
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}

	/// Deletes the location. If items are still in it, sets error to "Still holds items".
	public func delete() async throws {
		do {
			try await api.deleteLocation(id: locationId)
			isDeleted = true
		} catch let err as APIError where err.status == 409 {
			errorMessage = "Still holds items"
			throw err
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
			throw error
		}
	}

	/// Moves specified items to a destination location (nil = no location).
	public func moveItems(itemIds: [ID], toLocationId: ID?) async {
		guard !itemIds.isEmpty else { return }
		do {
			let req = MoveItemsRequest(itemIds: itemIds, toLocationId: toLocationId)
			_ = try await api.moveItems(req)
			selectedItemIds.removeAll()
			isSelectingItems = false
			await load()
		} catch {
			errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
		}
	}
}
