import Foundation
import WardrobeKit

// MARK: - Tree Node

/// A hierarchical node representing a location and its nested child locations.
public struct LocationNode: Identifiable, Hashable, Sendable {
	public let location: LocationDTO
	public var children: [LocationNode]?

	public var id: ID { location.id }

	public init(location: LocationDTO, children: [LocationNode]? = nil) {
		self.location = location
		self.children = children
	}

	/// Recursive item count including all nested child locations.
	public var totalItemCount: Int {
		location.itemCount + (children?.reduce(0) { $0 + $1.totalItemCount } ?? 0)
	}
}

// MARK: - Tree Builder

/// Builds a forest of tree nodes from a flat array of locations.
/// Roots are locations whose `parentId` is nil or not present in the given list.
/// Locations are sorted by code naturally (numeric comparison).
public func buildLocationTree(from locations: [LocationDTO]) -> [LocationNode] {
	let allIds = Set(locations.map(\.id))
	var childrenByParent: [ID: [LocationDTO]] = [:]

	for loc in locations {
		if let parentId = loc.parentId, allIds.contains(parentId) {
			childrenByParent[parentId, default: []].append(loc)
		}
	}

	func sort(_ list: [LocationDTO]) -> [LocationDTO] {
		list.sorted { $0.code.localizedStandardCompare($1.code) == .orderedAscending }
	}

	func buildNode(_ loc: LocationDTO, seen: Set<ID>) -> LocationNode {
		let childLocations = sort(childrenByParent[loc.id] ?? []).filter { !seen.contains($0.id) }
		var nextSeen = seen
		nextSeen.insert(loc.id)

		let childNodes = childLocations.map { buildNode($0, seen: nextSeen) }
		return LocationNode(
			location: loc,
			children: childNodes.isEmpty ? nil : childNodes
		)
	}

	let roots = sort(locations.filter { loc in
		guard let parentId = loc.parentId else { return true }
		return !allIds.contains(parentId)
	})

	return roots.map { buildNode($0, seen: [$0.id]) }
}
