import Foundation
import WardrobeKit

/// Encapsulates filtering parameters for the locations list and produces a `LocationQuery`.
public struct LocationsFilter: Hashable, Sendable {
	public var owner: ID?
	public var kind: LocationKind?
	public var q: String?
	public var archived: Bool

	public init(
		owner: ID? = nil,
		kind: LocationKind? = nil,
		q: String? = nil,
		archived: Bool = false
	) {
		self.owner = owner
		self.kind = kind
		self.q = q
		self.archived = archived
	}

	/// Constructs the corresponding `LocationQuery` for the API.
	public func makeQuery() -> LocationQuery {
		let trimmedQuery = q?.trimmingCharacters(in: .whitespacesAndNewlines)
		return LocationQuery(
			owner: owner,
			kind: kind,
			q: (trimmedQuery?.isEmpty ?? true) ? nil : trimmedQuery,
			archived: archived ? true : nil
		)
	}
}
