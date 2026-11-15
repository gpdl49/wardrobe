import Foundation

/// Contract representation of FeaturesDTO.
public struct FeaturesDTO: Codable, Hashable, Sendable {
	public var vision: Bool
	public var suggestions: Bool
	public var immich: Bool
	public init(vision: Bool, suggestions: Bool, immich: Bool) {
		self.vision = vision
		self.suggestions = suggestions
		self.immich = immich
	}
}

/// Contract representation of OutfitPhotoDTO.
public struct OutfitPhotoDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var source: OutfitPhotoSource
	public var status: PhotoStatus
	public var width: Int?
	public var height: Int?
	public var blurhash: String?
	public var thumbhash: String?
	public var assetId: ID?
	public var takenAt: Date?
	public var createdAt: Date
	public var urls: [String: String]
	public init(
		id: ID, source: OutfitPhotoSource, status: PhotoStatus, width: Int? = nil, height: Int? = nil,
		blurhash: String? = nil, thumbhash: String? = nil, assetId: ID? = nil, takenAt: Date? = nil,
		createdAt: Date, urls: [String: String]
	) {
		self.id = id
		self.source = source
		self.status = status
		self.width = width
		self.height = height
		self.blurhash = blurhash
		self.thumbhash = thumbhash
		self.assetId = assetId
		self.takenAt = takenAt
		self.createdAt = createdAt
		self.urls = urls
	}
}

/// Contract representation of OutfitItemRef.
public struct OutfitItemRef: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var name: String?
	public var coverPhoto: PhotoDTO?
	public init(id: ID, name: String? = nil, coverPhoto: PhotoDTO? = nil) {
		self.id = id
		self.name = name
		self.coverPhoto = coverPhoto
	}
}

/// Contract representation of OutfitSummaryDTO.
public struct OutfitSummaryDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var name: String
	public var notes: String?
	public var seasons: [Season]
	public var tags: [String]
	public var itemCount: Int
	public var previewItems: [OutfitItemRef]
	public var cover: OutfitPhotoDTO?
	public var createdAt: Date
	public var updatedAt: Date
	public init(
		id: ID, ownerId: ID, access: Access, name: String, notes: String? = nil, seasons: [Season],
		tags: [String], itemCount: Int, previewItems: [OutfitItemRef], cover: OutfitPhotoDTO? = nil,
		createdAt: Date, updatedAt: Date
	) {
		self.id = id
		self.ownerId = ownerId
		self.access = access
		self.name = name
		self.notes = notes
		self.seasons = seasons
		self.tags = tags
		self.itemCount = itemCount
		self.previewItems = previewItems
		self.cover = cover
		self.createdAt = createdAt
		self.updatedAt = updatedAt
	}
}

/// Contract representation of OutfitShareDTO.
public struct OutfitShareDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var grantee: UserRef
	public var createdAt: Date
	public init(id: ID, grantee: UserRef, createdAt: Date) {
		self.id = id
		self.grantee = grantee
		self.createdAt = createdAt
	}
}

/// Contract representation of OutfitDetailDTO.
public struct OutfitDetailDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var access: Access
	public var name: String
	public var notes: String?
	public var seasons: [Season]
	public var tags: [String]
	public var itemCount: Int
	public var previewItems: [OutfitItemRef]
	public var cover: OutfitPhotoDTO?
	public var createdAt: Date
	public var updatedAt: Date
	public var owner: UserRef
	public var items: [ItemSummaryDTO]
	public var photos: [OutfitPhotoDTO]
	public var shares: [OutfitShareDTO]
	public init(
		id: ID, ownerId: ID, access: Access, name: String, notes: String? = nil, seasons: [Season],
		tags: [String], itemCount: Int, previewItems: [OutfitItemRef], cover: OutfitPhotoDTO? = nil,
		createdAt: Date, updatedAt: Date, owner: UserRef, items: [ItemSummaryDTO], photos: [OutfitPhotoDTO],
		shares: [OutfitShareDTO]
	) {
		self.id = id
		self.ownerId = ownerId
		self.access = access
		self.name = name
		self.notes = notes
		self.seasons = seasons
		self.tags = tags
		self.itemCount = itemCount
		self.previewItems = previewItems
		self.cover = cover
		self.createdAt = createdAt
		self.updatedAt = updatedAt
		self.owner = owner
		self.items = items
		self.photos = photos
		self.shares = shares
	}
}

/// Contract representation of OutfitListDTO.
public struct OutfitListDTO: Codable, Hashable, Sendable {
	public var outfits: [OutfitSummaryDTO]
	public var nextCursor: String?
	public init(outfits: [OutfitSummaryDTO], nextCursor: String? = nil) {
		self.outfits = outfits
		self.nextCursor = nextCursor
	}
}

/// Contract representation of ImmichUserDTO.
public struct ImmichUserDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var email: String?
	public var name: String?
	public init(id: ID, email: String? = nil, name: String? = nil) {
		self.id = id
		self.email = email
		self.name = name
	}
}

/// Contract representation of ImmichStatusDTO.
public struct ImmichStatusDTO: Codable, Hashable, Sendable {
	public var enabled: Bool
	public var connected: Bool
	public var url: String?
	public var user: ImmichUserDTO?
	public init(enabled: Bool, connected: Bool, url: String? = nil, user: ImmichUserDTO? = nil) {
		self.enabled = enabled
		self.connected = connected
		self.url = url
		self.user = user
	}
}

/// Contract representation of ImmichAssetDTO.
public struct ImmichAssetDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var fileName: String?
	public var width: Int?
	public var height: Int?
	public var thumbhash: String?
	public var takenAt: Date?
	public var thumbUrl: String
	public init(
		id: ID, fileName: String? = nil, width: Int? = nil, height: Int? = nil, thumbhash: String? = nil,
		takenAt: Date? = nil, thumbUrl: String
	) {
		self.id = id
		self.fileName = fileName
		self.width = width
		self.height = height
		self.thumbhash = thumbhash
		self.takenAt = takenAt
		self.thumbUrl = thumbUrl
	}
}

/// Contract representation of ImmichAssetListDTO.
public struct ImmichAssetListDTO: Codable, Hashable, Sendable {
	public var assets: [ImmichAssetDTO]
	public var nextCursor: String?
	public init(assets: [ImmichAssetDTO], nextCursor: String? = nil) {
		self.assets = assets
		self.nextCursor = nextCursor
	}
}

/// Contract representation of SuggestionRequest.
public struct SuggestionRequest: Codable, Hashable, Sendable {
	public var prompt: String?
	public var season: Season?
	public var itemIds: [ID]?
	public var count: Int?
	public init(prompt: String? = nil, season: Season? = nil, itemIds: [ID]? = nil, count: Int? = nil) {
		self.prompt = prompt
		self.season = season
		self.itemIds = itemIds
		self.count = count
	}
}

/// Contract representation of OutfitSuggestionDTO.
public struct OutfitSuggestionDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var runId: ID
	public var name: String
	public var rationale: String?
	public var items: [ItemSummaryDTO]
	public var feedback: SuggestionFeedback?
	public var outfitId: ID?
	public var createdAt: Date
	public init(
		id: ID, runId: ID, name: String, rationale: String? = nil, items: [ItemSummaryDTO],
		feedback: SuggestionFeedback? = nil, outfitId: ID? = nil, createdAt: Date
	) {
		self.id = id
		self.runId = runId
		self.name = name
		self.rationale = rationale
		self.items = items
		self.feedback = feedback
		self.outfitId = outfitId
		self.createdAt = createdAt
	}
}

/// Contract representation of SuggestionRunDTO.
public struct SuggestionRunDTO: Codable, Hashable, Sendable, Identifiable {
	public var id: ID
	public var ownerId: ID
	public var status: SuggestionStatus
	public var request: SuggestionRequest
	public var model: String?
	public var error: String?
	public var createdAt: Date
	public var updatedAt: Date
	public var suggestions: [OutfitSuggestionDTO]
	public init(
		id: ID, ownerId: ID, status: SuggestionStatus, request: SuggestionRequest, model: String? = nil,
		error: String? = nil, createdAt: Date, updatedAt: Date, suggestions: [OutfitSuggestionDTO]
	) {
		self.id = id
		self.ownerId = ownerId
		self.status = status
		self.request = request
		self.model = model
		self.error = error
		self.createdAt = createdAt
		self.updatedAt = updatedAt
		self.suggestions = suggestions
	}
}

/// Contract representation of BulkAnalysesDTO.
public struct BulkAnalysesDTO: Codable, Hashable, Sendable {
	public var queued: Int
	public init(queued: Int) {
		self.queued = queued
	}
}

/// Contract representation of BulkApplyTagsDTO.
public struct BulkApplyTagsDTO: Codable, Hashable, Sendable {
	public var updated: Int
	public init(updated: Int) {
		self.updated = updated
	}
}

public struct OutfitPhotoSource: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let upload: Self = "upload"
	public static let immich: Self = "immich"
	public static let known: [Self] = [.upload, .immich]
}

public struct SuggestionStatus: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let queued: Self = "queued"
	public static let running: Self = "running"
	public static let done: Self = "done"
	public static let failed: Self = "failed"
	public static let known: [Self] = [.queued, .running, .done, .failed]
}

public struct SuggestionFeedback: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let saved: Self = "saved"
	public static let dismissed: Self = "dismissed"
	public static let known: [Self] = [.saved, .dismissed]
}
