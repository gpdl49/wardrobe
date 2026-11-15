import Foundation
import Observation
import WardrobeKit

/// View-model managing location fetching, client-side filtering, and hierarchy building.
@MainActor
@Observable
public final class LocationsModel {
	public let api: any WardrobeAPI

	public private(set) var locations: [LocationDTO] = []
	public private(set) var isLoading: Bool = false
	public var errorMessage: String?
	weak var appModel: AppModel?

	// Filter criteria
	public var ownerId: ID?
	public var selectedKind: LocationKind?
	public var searchText: String = ""
	public var showArchived: Bool = false

	public init(api: any WardrobeAPI) {
		self.api = api
	}

	/// Current filter representation.
	public var filter: LocationsFilter {
		LocationsFilter(
			owner: ownerId,
			kind: selectedKind,
			q: searchText,
			archived: showArchived
		)
	}

	/// Locations matching the current kind and search query.
	public var filteredLocations: [LocationDTO] {
		var list = locations
		if let selectedKind {
			list = list.filter { $0.kind == selectedKind }
		}
		let needle = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
		if !needle.isEmpty {
			list = list.filter {
				$0.code.lowercased().contains(needle)
					|| $0.name.lowercased().contains(needle)
					|| ($0.notes?.lowercased().contains(needle) ?? false)
			}
		}
		return list
	}

	/// Hierarchical forest of location nodes built from the filtered locations.
	public var rootNodes: [LocationNode] {
		buildLocationTree(from: filteredLocations)
	}

	/// Fetches locations from the API matching the owner and archive settings.
	public func load() async {
		isLoading = true
		errorMessage = nil
		defer { isLoading = false }

		do {
			// Query the API with owner and archived flags. Kind and text are filtered client-side for responsive UI.
			let query = LocationQuery(
				owner: ownerId,
				kind: nil,
				q: nil,
				archived: showArchived ? true : nil
			)
			locations = try await api.locations(query)
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	/// Creates a new location and reloads the list.
	@discardableResult
	public func createLocation(
		kind: LocationKind,
		code: String,
		name: String,
		notes: String? = nil,
		parentId: ID? = nil,
		ownerId: ID? = nil
	) async throws -> LocationDTO {
		guard let normalizedCode = normalizeLocationCode(code) else {
			throw APIError(status: 400, error: "bad_request", message: "Invalid location code")
		}
		let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmedName.isEmpty else {
			throw APIError(status: 400, error: "bad_request", message: "Name is required")
		}

		let request = CreateLocationRequest(
			kind: kind,
			code: normalizedCode,
			name: trimmedName,
			notes: notes?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? notes : nil,
			parentId: parentId,
			ownerId: ownerId ?? self.ownerId
		)

		let created = try await api.createLocation(request)
		await load()
		return created
	}
}
