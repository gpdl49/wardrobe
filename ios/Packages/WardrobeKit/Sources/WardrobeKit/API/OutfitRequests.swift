import Foundation

public struct OutfitQuery: Hashable, Sendable {
	public var owner: String?
	public var q: String?
	public var tag: String?
	public var season: Season?
	public var item: String?
	public var cursor: String?
	public var limit: Int?
	public init(
		owner: String? = nil, q: String? = nil, tag: String? = nil, season: Season? = nil, item: String? = nil,
		cursor: String? = nil, limit: Int? = nil
	) {
		self.owner = owner
		self.q = q
		self.tag = tag
		self.season = season
		self.item = item
		self.cursor = cursor
		self.limit = limit
	}
	public var queryItems: [URLQueryItem] {
		var result: [URLQueryItem] = []
		if let owner { result.append(URLQueryItem(name: "owner", value: owner)) }
		if let q { result.append(URLQueryItem(name: "q", value: q)) }
		if let tag { result.append(URLQueryItem(name: "tag", value: tag)) }
		if let season { result.append(URLQueryItem(name: "season", value: season.rawValue)) }
		if let item { result.append(URLQueryItem(name: "item", value: item)) }
		if let cursor { result.append(URLQueryItem(name: "cursor", value: cursor)) }
		if let limit { result.append(URLQueryItem(name: "limit", value: String(limit))) }
		return result
	}
}

public struct ImmichAssetQuery: Hashable, Sendable {
	public var q: String?
	public var cursor: String?
	public var limit: Int?
	public init(q: String? = nil, cursor: String? = nil, limit: Int? = nil) {
		self.q = q
		self.cursor = cursor
		self.limit = limit
	}
	public var queryItems: [URLQueryItem] {
		var result: [URLQueryItem] = []
		if let q { result.append(URLQueryItem(name: "q", value: q)) }
		if let cursor { result.append(URLQueryItem(name: "cursor", value: cursor)) }
		if let limit { result.append(URLQueryItem(name: "limit", value: String(limit))) }
		return result
	}
}

public struct CreateOutfitRequest: Codable, Hashable, Sendable {
	public var name: String
	public var notes: String?
	public var seasons: [Season]?
	public var tags: [String]?
	public var itemIds: [ID]?
	public var ownerId: ID?
	public var suggestionId: ID?
	public init(
		name: String, notes: String? = nil, seasons: [Season]? = nil, tags: [String]? = nil,
		itemIds: [ID]? = nil, ownerId: ID? = nil, suggestionId: ID? = nil
	) {
		self.name = name
		self.notes = notes
		self.seasons = seasons
		self.tags = tags
		self.itemIds = itemIds
		self.ownerId = ownerId
		self.suggestionId = suggestionId
	}
}

public struct CreateOutfitShareRequest: Codable, Hashable, Sendable {
	public var grantee: String
	public init(grantee: String) {
		self.grantee = grantee
	}
}

public struct ConnectImmichRequest: Codable, Hashable, Sendable {
	public var apiKey: String
	public init(apiKey: String) {
		self.apiKey = apiKey
	}
}

public struct LinkImmichAssetsRequest: Codable, Hashable, Sendable {
	public var assetIds: [ID]
	public init(assetIds: [ID]) {
		self.assetIds = assetIds
	}
}

public struct CreateSuggestionRunRequest: Codable, Hashable, Sendable {
	public var ownerId: ID?
	public var prompt: String?
	public var season: Season?
	public var itemIds: [ID]?
	public var count: Int?
	public init(
		ownerId: ID? = nil, prompt: String? = nil, season: Season? = nil, itemIds: [ID]? = nil,
		count: Int? = nil
	) {
		self.ownerId = ownerId
		self.prompt = prompt
		self.season = season
		self.itemIds = itemIds
		self.count = count
	}
}

public struct BulkItemsRequest: Codable, Hashable, Sendable {
	public var ownerId: ID?
	public var itemIds: [ID]?
	public init(ownerId: ID? = nil, itemIds: [ID]? = nil) {
		self.ownerId = ownerId
		self.itemIds = itemIds
	}
}

public struct UpdateOutfitRequest: Encodable, Hashable, Sendable {
	public var name: String?
	public var notes: Patch<String>
	public var seasons: [Season]?
	public var tags: [String]?
	public var itemIds: [ID]?
	public init(
		name: String? = nil, notes: Patch<String> = .unset, seasons: [Season]? = nil, tags: [String]? = nil,
		itemIds: [ID]? = nil
	) {
		self.name = name
		self.notes = notes
		self.seasons = seasons
		self.tags = tags
		self.itemIds = itemIds
	}
	enum CodingKeys: String, CodingKey { case name, notes, seasons, tags, itemIds }
	public func encode(to encoder: any Encoder) throws {
		var c = encoder.container(keyedBy: CodingKeys.self)
		try c.encodeIfPresent(name, forKey: .name)
		try c.encode(notes, forKey: .notes)
		try c.encodeIfPresent(seasons, forKey: .seasons)
		try c.encodeIfPresent(tags, forKey: .tags)
		try c.encodeIfPresent(itemIds, forKey: .itemIds)
	}
}
