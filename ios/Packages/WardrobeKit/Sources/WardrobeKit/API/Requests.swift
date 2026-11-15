import Foundation

// Request bodies and queries, from lib/<feature>/schema.ts. Absent optional
// fields are omitted; `Patch` fields distinguish "leave alone" from "null".

// MARK: Items

public struct ItemQuery: Hashable, Sendable {
	/// A user id; whose wardrobe to list. Nil: the caller's.
	public var owner: ID?
	/// Location id or code.
	public var location: String?
	/// Category id or slug; includes its subcategories.
	public var category: String?
	public var tag: String?
	public var season: Season?
	public var status: ItemStatus?
	/// Colour name from the palette, e.g. "navy".
	public var color: String?
	public var q: String?
	public var cursor: String?
	/// 1...100, server default 50.
	public var limit: Int?

	public init(
		owner: ID? = nil, location: String? = nil, category: String? = nil,
		tag: String? = nil, season: Season? = nil, status: ItemStatus? = nil,
		color: String? = nil, q: String? = nil, cursor: String? = nil,
		limit: Int? = nil
	) {
		self.owner = owner; self.location = location; self.category = category
		self.tag = tag; self.season = season; self.status = status
		self.color = color; self.q = q; self.cursor = cursor; self.limit = limit
	}

	/// Non-nil, non-empty parameters in a stable order.
	public var queryItems: [URLQueryItem] {
		let pairs: [(String, String?)] = [
			("owner", owner), ("location", location), ("category", category),
			("tag", tag), ("season", season?.rawValue), ("status", status?.rawValue),
			("color", color), ("q", q), ("cursor", cursor), ("limit", limit.map(String.init)),
		]
		return pairs.compactMap { k, v in
			guard let v, !v.isEmpty else { return nil }
			return URLQueryItem(name: k, value: v)
		}
	}
}

/// POST /api/items. Every field optional.
public struct CreateItemRequest: Codable, Hashable, Sendable {
	public var name: String?
	public var categoryId: ID?
	public var brand: String?
	public var size: String?
	public var colors: [ItemColor]?
	public var pattern: String?
	public var material: String?
	public var seasons: [Season]?
	public var status: ItemStatus?
	public var locationId: ID?
	public var notes: String?
	public var tags: [String]?
	public var sessionId: ID?
	public var ownerId: ID?

	public init(
		name: String? = nil, categoryId: ID? = nil, brand: String? = nil,
		size: String? = nil, colors: [ItemColor]? = nil, pattern: String? = nil,
		material: String? = nil, seasons: [Season]? = nil, status: ItemStatus? = nil,
		locationId: ID? = nil, notes: String? = nil, tags: [String]? = nil,
		sessionId: ID? = nil, ownerId: ID? = nil
	) {
		self.name = name; self.categoryId = categoryId; self.brand = brand
		self.size = size; self.colors = colors; self.pattern = pattern
		self.material = material; self.seasons = seasons; self.status = status
		self.locationId = locationId; self.notes = notes; self.tags = tags
		self.sessionId = sessionId; self.ownerId = ownerId
	}
}

/// PATCH /api/items/{id}
public struct UpdateItemRequest: Encodable, Hashable, Sendable {
	public var name: Patch<String> = .unset
	public var categoryId: Patch<ID> = .unset
	public var brand: Patch<String> = .unset
	public var size: Patch<String> = .unset
	public var colors: [ItemColor]?
	public var pattern: Patch<String> = .unset
	public var material: Patch<String> = .unset
	public var seasons: [Season]?
	public var status: ItemStatus?
	public var locationId: Patch<ID> = .unset
	public var notes: Patch<String> = .unset
	/// Replaces the item's tags.
	public var tags: [String]?
	public var coverPhotoId: Patch<ID> = .unset
	/// Recorded on the Movement a location change writes.
	public var sessionId: ID?

	public init() {}

	enum CodingKeys: String, CodingKey {
		case name, categoryId, brand, size, colors, pattern, material, seasons
		case status, locationId, notes, tags, coverPhotoId, sessionId
	}

	public func encode(to encoder: any Encoder) throws {
		var c = encoder.container(keyedBy: CodingKeys.self)
		try c.encode(name, forKey: .name)
		try c.encode(categoryId, forKey: .categoryId)
		try c.encode(brand, forKey: .brand)
		try c.encode(size, forKey: .size)
		try c.encodeIfPresent(colors, forKey: .colors)
		try c.encode(pattern, forKey: .pattern)
		try c.encode(material, forKey: .material)
		try c.encodeIfPresent(seasons, forKey: .seasons)
		try c.encodeIfPresent(status, forKey: .status)
		try c.encode(locationId, forKey: .locationId)
		try c.encode(notes, forKey: .notes)
		try c.encodeIfPresent(tags, forKey: .tags)
		try c.encode(coverPhotoId, forKey: .coverPhotoId)
		try c.encodeIfPresent(sessionId, forKey: .sessionId)
	}
}

/// POST /api/items/move
public struct MoveItemsRequest: Encodable, Hashable, Sendable {
	public var itemIds: [ID]
	/// Nil moves the items out of any location (sent as null).
	public var toLocationId: ID?
	public var sessionId: ID?

	public init(itemIds: [ID], toLocationId: ID?, sessionId: ID? = nil) {
		self.itemIds = itemIds; self.toLocationId = toLocationId; self.sessionId = sessionId
	}

	enum CodingKeys: String, CodingKey { case itemIds, toLocationId, sessionId }
	public func encode(to encoder: any Encoder) throws {
		var c = encoder.container(keyedBy: CodingKeys.self)
		try c.encode(itemIds, forKey: .itemIds)
		try c.encode(toLocationId, forKey: .toLocationId)  // null is meaningful
		try c.encodeIfPresent(sessionId, forKey: .sessionId)
	}
}

public struct MoveItemsResult: Decodable, Hashable, Sendable {
	public var moved: Int
	public init(moved: Int) {
		self.moved = moved
	}
}

// MARK: Locations

public struct LocationQuery: Hashable, Sendable {
	public var owner: ID?
	public var kind: LocationKind?
	public var q: String?
	/// Archived locations are hidden unless true.
	public var archived: Bool?

	public init(owner: ID? = nil, kind: LocationKind? = nil, q: String? = nil, archived: Bool? = nil) {
		self.owner = owner; self.kind = kind; self.q = q; self.archived = archived
	}

	public var queryItems: [URLQueryItem] {
		let pairs: [(String, String?)] = [
			("owner", owner), ("kind", kind?.rawValue), ("q", q),
			("archived", archived.map { $0 ? "true" : "false" }),
		]
		return pairs.compactMap { k, v in
			guard let v, !v.isEmpty else { return nil }
			return URLQueryItem(name: k, value: v)
		}
	}
}

/// POST /api/locations. `code` is trimmed and upper-cased by the server
/// (`[A-Z0-9][A-Z0-9-]{0,31}`).
public struct CreateLocationRequest: Encodable, Hashable, Sendable {
	public var kind: LocationKind
	public var code: String
	public var name: String
	public var notes: String?
	public var parentId: ID?
	public var ownerId: ID?

	public init(kind: LocationKind, code: String, name: String, notes: String? = nil, parentId: ID? = nil, ownerId: ID? = nil) {
		self.kind = kind; self.code = code; self.name = name; self.notes = notes
		self.parentId = parentId; self.ownerId = ownerId
	}
}

/// PATCH /api/locations/{id}
public struct UpdateLocationRequest: Encodable, Hashable, Sendable {
	public var kind: LocationKind?
	public var code: String?
	public var name: String?
	public var notes: Patch<String> = .unset
	public var parentId: Patch<ID> = .unset
	/// `.value(date)` archives, `.null` restores.
	public var archivedAt: Patch<Date> = .unset

	public init() {}

	enum CodingKeys: String, CodingKey { case kind, code, name, notes, parentId, archivedAt }
	public func encode(to encoder: any Encoder) throws {
		var c = encoder.container(keyedBy: CodingKeys.self)
		try c.encodeIfPresent(kind, forKey: .kind)
		try c.encodeIfPresent(code, forKey: .code)
		try c.encodeIfPresent(name, forKey: .name)
		try c.encode(notes, forKey: .notes)
		try c.encode(parentId, forKey: .parentId)
		try c.encode(archivedAt, forKey: .archivedAt)
	}
}

/// Client-side check matching the server's code rule; returns the normalised
/// code or nil.
public func normalizeLocationCode(_ raw: String) -> String? {
	let code = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
	guard code.wholeMatch(of: /[A-Z0-9][A-Z0-9-]{0,31}/) != nil else { return nil }
	return code
}

// MARK: Photos

/// POST /api/photos. The app only uploads JPEG.
public struct CreatePhotoRequest: Encodable, Hashable, Sendable {
	public var itemId: ID?
	public var kind: PhotoKind
	public var contentType: String
	public var size: Int
	public init(itemId: ID?, kind: PhotoKind, contentType: String = "image/jpeg", size: Int) {
		self.itemId = itemId; self.kind = kind; self.contentType = contentType; self.size = size
	}
}

/// PATCH /api/photos/{id}
public struct UpdatePhotoRequest: Encodable, Hashable, Sendable {
	public var itemId: Patch<ID> = .unset
	public var kind: PhotoKind?
	public init(itemId: Patch<ID> = .unset, kind: PhotoKind? = nil) {
		self.itemId = itemId; self.kind = kind
	}
	enum CodingKeys: String, CodingKey { case itemId, kind }
	public func encode(to encoder: any Encoder) throws {
		var c = encoder.container(keyedBy: CodingKeys.self)
		try c.encode(itemId, forKey: .itemId)
		try c.encodeIfPresent(kind, forKey: .kind)
	}
}

// MARK: Sessions, shares, analyses

public struct CreateSessionRequest: Encodable, Hashable, Sendable {
	public var mode: SessionMode
	public var locationId: ID
	public init(mode: SessionMode, locationId: ID) { self.mode = mode; self.locationId = locationId }
}

public struct CreateShareRequest: Encodable, Hashable, Sendable {
	/// Email or username of someone who has signed in once.
	public var grantee: String
	public var access: ShareAccess
	/// Nil: the whole wardrobe.
	public var locationId: ID?
	public init(grantee: String, access: ShareAccess, locationId: ID? = nil) {
		self.grantee = grantee; self.access = access; self.locationId = locationId
	}
}
