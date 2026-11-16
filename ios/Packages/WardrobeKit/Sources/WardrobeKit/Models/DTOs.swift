import Foundation

// Response shapes of the HTTP API, field for field from lib/api/types.ts.
// Dates are ISO 8601 strings on the wire, decoded by `JSONDecoder.wardrobe`.
// Change lib/api/types.ts first, then here, in the same PR.

public typealias ID = String

public struct LocationDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var kind: LocationKind
	public var code: String
	public var name: String
	public var notes: String?
	public var parentId: ID?
	public var archivedAt: Date?
	public var createdAt: Date
	public var updatedAt: Date
	public var itemCount: Int

	public init(
		id: ID, ownerId: ID, access: Access, kind: LocationKind, code: String,
		name: String, notes: String? = nil, parentId: ID? = nil,
		archivedAt: Date? = nil, createdAt: Date, updatedAt: Date, itemCount: Int
	) {
		self.id = id; self.ownerId = ownerId; self.access = access
		self.kind = kind; self.code = code; self.name = name; self.notes = notes
		self.parentId = parentId; self.archivedAt = archivedAt
		self.createdAt = createdAt; self.updatedAt = updatedAt
		self.itemCount = itemCount
	}

	public var ref: LocationRef { LocationRef(id: id, kind: kind, code: code, name: name) }
}

/// GET /api/locations/{id}
public struct LocationDetailDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var kind: LocationKind
	public var code: String
	public var name: String
	public var notes: String?
	public var parentId: ID?
	public var archivedAt: Date?
	public var createdAt: Date
	public var updatedAt: Date
	public var itemCount: Int
	public var items: [ItemSummaryDTO]
	public var children: [LocationDTO]

	public var location: LocationDTO {
		LocationDTO(
			id: id, ownerId: ownerId, access: access, kind: kind, code: code,
			name: name, notes: notes, parentId: parentId, archivedAt: archivedAt,
			createdAt: createdAt, updatedAt: updatedAt, itemCount: itemCount)
	}
	public init(id: ID, ownerId: ID, access: Access, kind: LocationKind, code: String, name: String, notes: String? = nil, parentId: ID? = nil, archivedAt: Date? = nil, createdAt: Date, updatedAt: Date, itemCount: Int, items: [ItemSummaryDTO], children: [LocationDTO]) {
		self.id = id
		self.ownerId = ownerId
		self.access = access
		self.kind = kind
		self.code = code
		self.name = name
		self.notes = notes
		self.parentId = parentId
		self.archivedAt = archivedAt
		self.createdAt = createdAt
		self.updatedAt = updatedAt
		self.itemCount = itemCount
		self.items = items
		self.children = children
	}
}

/// Compact reference embedded in items and movements.
public struct LocationRef: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var kind: LocationKind
	public var code: String
	public var name: String
	public init(id: ID, kind: LocationKind, code: String, name: String) {
		self.id = id; self.kind = kind; self.code = code; self.name = name
	}
}

public struct CategoryDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var name: String
	public var slug: String
	public var parentId: ID?
	public var sortOrder: Int
	public init(id: ID, name: String, slug: String, parentId: ID? = nil, sortOrder: Int = 0) {
		self.id = id; self.name = name; self.slug = slug
		self.parentId = parentId; self.sortOrder = sortOrder
	}
}

public struct CategoryRef: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var name: String
	public var slug: String
	public init(id: ID, name: String, slug: String) {
		self.id = id; self.name = name; self.slug = slug
	}
}

/// GET /api/tags
public struct TagCountDTO: Codable, Hashable, Sendable {
	public var name: String
	public var count: Int
	public init(name: String, count: Int) {
		self.name = name
		self.count = count
	}
}

public struct ItemColor: Codable, Hashable, Sendable {
	/// Human name from the palette, e.g. "navy".
	public var name: String
	/// #rrggbb
	public var hex: String
	/// Share of the garment's pixels, 0...1; the list is sorted by share desc.
	public var share: Double
	public init(name: String, hex: String, share: Double) {
		self.name = name; self.hex = hex; self.share = share
	}
}

public struct PhotoDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var itemId: ID?
	public var outfitId: ID?
	public var kind: PhotoKind
	public var status: PhotoStatus
	public var contentType: String
	public var size: Int
	public var width: Int?
	public var height: Int?
	public var blurhash: String?
	public var createdAt: Date
	/// `/api/photos/{id}/{variant}` keyed by variant raw value; display and
	/// thumb only mean something when status is ready.
	public var urls: [String: String]

	public init(
		id: ID, ownerId: ID, access: Access, itemId: ID?, outfitId: ID? = nil, kind: PhotoKind,
		status: PhotoStatus, contentType: String, size: Int, width: Int? = nil,
		height: Int? = nil, blurhash: String? = nil, createdAt: Date,
		urls: [String: String] = [:]
	) {
		self.id = id; self.ownerId = ownerId; self.access = access
		self.itemId = itemId; self.outfitId = outfitId; self.kind = kind; self.status = status
		self.contentType = contentType; self.size = size; self.width = width
		self.height = height; self.blurhash = blurhash; self.createdAt = createdAt
		self.urls = urls
	}
}

/// Item in lists (GET /api/items, location contents).
public struct ItemSummaryDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var name: String?
	public var nameGenerated: Bool?
	public var category: CategoryRef?
	public var brand: String?
	public var size: String?
	public var colors: [ItemColor]
	public var pattern: String?
	public var material: String?
	public var seasons: [Season]
	public var status: ItemStatus
	public var location: LocationRef?
	public var notes: String?
	public var tags: [String]
	public var coverPhoto: PhotoDTO?
	public var createdAt: Date
	public var updatedAt: Date

	public init(
		id: ID, ownerId: ID, access: Access, name: String? = nil, nameGenerated: Bool? = nil,
		category: CategoryRef? = nil, brand: String? = nil, size: String? = nil,
		colors: [ItemColor] = [], pattern: String? = nil, material: String? = nil,
		seasons: [Season] = [], status: ItemStatus = .active,
		location: LocationRef? = nil, notes: String? = nil, tags: [String] = [],
		coverPhoto: PhotoDTO? = nil, createdAt: Date, updatedAt: Date
	) {
		self.id = id; self.ownerId = ownerId; self.access = access
		self.nameGenerated = nameGenerated; self.name = name; self.category = category; self.brand = brand
		self.size = size; self.colors = colors; self.pattern = pattern
		self.material = material; self.seasons = seasons; self.status = status
		self.location = location; self.notes = notes; self.tags = tags
		self.coverPhoto = coverPhoto; self.createdAt = createdAt
		self.updatedAt = updatedAt
	}
}

public struct MovementDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var from: LocationRef?
	public var to: LocationRef?
	public var sessionId: ID?
	public var at: Date
	public init(id: ID, from: LocationRef? = nil, to: LocationRef? = nil, sessionId: ID? = nil, at: Date) {
		self.id = id
		self.from = from
		self.to = to
		self.sessionId = sessionId
		self.at = at
	}
}

/// Fields an analysis may suggest, all optional.
public struct ItemSuggestion: Codable, Hashable, Sendable {
	public var name: String?
	/// Slug of an existing category.
	public var categorySlug: String?
	public var brand: String?
	public var size: String?
	public var colors: [ItemColor]?
	public var pattern: String?
	public var material: String?
	public var seasons: [Season]?
	public var tags: [String]?
	/// Free text read from a care/brand label.
	public var labelText: String?

	/// Keys accepted by POST /items/{id}/analyses/{analysisId}/apply.
	public enum Field: String, Codable, Sendable, CaseIterable {
		case name, categorySlug, brand, size, colors, pattern, material, seasons, tags, labelText
	}
	public init(name: String? = nil, categorySlug: String? = nil, brand: String? = nil, size: String? = nil, colors: [ItemColor]? = nil, pattern: String? = nil, material: String? = nil, seasons: [Season]? = nil, tags: [String]? = nil, labelText: String? = nil) {
		self.name = name
		self.categorySlug = categorySlug
		self.brand = brand
		self.size = size
		self.colors = colors
		self.pattern = pattern
		self.material = material
		self.seasons = seasons
		self.tags = tags
		self.labelText = labelText
	}
}

public struct AnalysisDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var itemId: ID
	public var photoId: ID?
	public var kind: AnalysisKind
	public var model: String?
	public var status: AnalysisStatus
	/// Present when status is done.
	public var result: ItemSuggestion?
	public var error: String?
	public var appliedAt: Date?
	public var createdAt: Date
	public var updatedAt: Date
	public init(id: ID, itemId: ID, photoId: ID? = nil, kind: AnalysisKind, model: String? = nil, status: AnalysisStatus, result: ItemSuggestion? = nil, error: String? = nil, appliedAt: Date? = nil, createdAt: Date, updatedAt: Date) {
		self.id = id
		self.itemId = itemId
		self.photoId = photoId
		self.kind = kind
		self.model = model
		self.status = status
		self.result = result
		self.error = error
		self.appliedAt = appliedAt
		self.createdAt = createdAt
		self.updatedAt = updatedAt
	}
}

/// GET /api/items/{id}
public struct ItemDetailDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var name: String?
	public var nameGenerated: Bool?
	public var category: CategoryRef?
	public var brand: String?
	public var size: String?
	public var colors: [ItemColor]
	public var pattern: String?
	public var material: String?
	public var seasons: [Season]
	public var status: ItemStatus
	public var location: LocationRef?
	public var notes: String?
	public var tags: [String]
	public var coverPhoto: PhotoDTO?
	public var createdAt: Date
	public var updatedAt: Date
	public var photos: [PhotoDTO]
	public var movements: [MovementDTO]
	public var analyses: [AnalysisDTO]

	public var summary: ItemSummaryDTO {
		ItemSummaryDTO(
			id: id, ownerId: ownerId, access: access, name: name, nameGenerated: nameGenerated, category: category,
			brand: brand, size: size, colors: colors, pattern: pattern,
			material: material, seasons: seasons, status: status, location: location,
			notes: notes, tags: tags, coverPhoto: coverPhoto, createdAt: createdAt,
			updatedAt: updatedAt)
	}
	public init(id: ID, ownerId: ID, access: Access, name: String? = nil, nameGenerated: Bool? = nil, category: CategoryRef? = nil, brand: String? = nil, size: String? = nil, colors: [ItemColor], pattern: String? = nil, material: String? = nil, seasons: [Season], status: ItemStatus, location: LocationRef? = nil, notes: String? = nil, tags: [String], coverPhoto: PhotoDTO? = nil, createdAt: Date, updatedAt: Date, photos: [PhotoDTO], movements: [MovementDTO], analyses: [AnalysisDTO]) {
		self.id = id
		self.ownerId = ownerId
		self.access = access
		self.nameGenerated = nameGenerated; self.name = name
		self.category = category
		self.brand = brand
		self.size = size
		self.colors = colors
		self.pattern = pattern
		self.material = material
		self.seasons = seasons
		self.status = status
		self.location = location
		self.notes = notes
		self.tags = tags
		self.coverPhoto = coverPhoto
		self.createdAt = createdAt
		self.updatedAt = updatedAt
		self.photos = photos
		self.movements = movements
		self.analyses = analyses
	}
}

/// GET /api/items
public struct ItemListDTO: Codable, Hashable, Sendable {
	public var items: [ItemSummaryDTO]
	public var nextCursor: String?
	public init(items: [ItemSummaryDTO], nextCursor: String?) {
		self.items = items; self.nextCursor = nextCursor
	}
}

/// POST /api/photos
public struct PhotoUploadDTO: Codable, Hashable, Sendable {
	public var photo: PhotoDTO
	public var uploadUrl: URL
	public var uploadHeaders: [String: String]
	public init(photo: PhotoDTO, uploadUrl: URL, uploadHeaders: [String: String]) {
		self.photo = photo
		self.uploadUrl = uploadUrl
		self.uploadHeaders = uploadHeaders
	}
}

public struct PackingSessionDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var mode: SessionMode
	public var locationId: ID
	public var startedAt: Date
	public var endedAt: Date?
	public init(id: ID, ownerId: ID, access: Access, mode: SessionMode, locationId: ID, startedAt: Date, endedAt: Date? = nil) {
		self.id = id
		self.ownerId = ownerId
		self.access = access
		self.mode = mode
		self.locationId = locationId
		self.startedAt = startedAt
		self.endedAt = endedAt
	}
}

/// GET /api/sessions/{id}: the session and the items moved in it.
public struct PackingSessionDetailDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var mode: SessionMode
	public var locationId: ID
	public var startedAt: Date
	public var endedAt: Date?
	public var location: LocationRef
	public var items: [ItemSummaryDTO]
	public init(id: ID, ownerId: ID, access: Access, mode: SessionMode, locationId: ID, startedAt: Date, endedAt: Date? = nil, location: LocationRef, items: [ItemSummaryDTO]) {
		self.id = id
		self.ownerId = ownerId
		self.access = access
		self.mode = mode
		self.locationId = locationId
		self.startedAt = startedAt
		self.endedAt = endedAt
		self.location = location
		self.items = items
	}
}

public struct MeDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var sub: String
	public var email: String?
	public var username: String?
	public var groups: [String]
	public var isAdmin: Bool
	public var features: FeaturesDTO?
	public init(id: ID, sub: String, email: String?, username: String?, groups: [String], isAdmin: Bool, features: FeaturesDTO? = nil) {
		self.id = id; self.sub = sub; self.email = email; self.username = username
		self.groups = groups; self.isAdmin = isAdmin; self.features = features
	}
	/// Username, else email, else the subject.
	public var displayName: String { username ?? email ?? sub }
}

/// Another user, as shown on a share.
public struct UserRef: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var email: String?
	public var username: String?
	public init(id: ID, email: String?, username: String?) {
		self.id = id; self.email = email; self.username = username
	}
	public var displayName: String { username ?? email ?? id }
}

/// GET /api/shares: a share the caller owns.
public struct ShareDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var grantee: UserRef
	public var access: ShareAccess
	/// Nil: the whole wardrobe.
	public var location: LocationRef?
	public var createdAt: Date
	public var updatedAt: Date
	public init(id: ID, ownerId: ID, grantee: UserRef, access: ShareAccess, location: LocationRef? = nil, createdAt: Date, updatedAt: Date) {
		self.id = id
		self.ownerId = ownerId
		self.grantee = grantee
		self.access = access
		self.location = location
		self.createdAt = createdAt
		self.updatedAt = updatedAt
	}
}

/// GET /api/shared-with-me
public struct SharedWithMeDTO: Codable, Hashable, Sendable, Identifiable {
	public struct LocationStub: Codable, Hashable, Sendable {
		public var id: ID
		public var code: String
		public var name: String
		public init(id: ID, code: String, name: String) {
			self.id = id
			self.code = code
			self.name = name
		}
	}
	public var id: ID
	public var owner: UserRef
	public var access: ShareAccess
	/// Nil: the whole wardrobe.
	public var location: LocationStub?
	public init(id: ID, owner: UserRef, access: ShareAccess, location: LocationStub? = nil) {
		self.id = id
		self.owner = owner
		self.access = access
		self.location = location
	}
}
