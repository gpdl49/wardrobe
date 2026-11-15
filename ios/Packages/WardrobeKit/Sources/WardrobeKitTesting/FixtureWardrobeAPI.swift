import Foundation
import WardrobeKit

/// In-memory `WardrobeAPI` for SwiftUI previews and view-model tests. Seeded
/// with a small wardrobe; writes change the in-memory state. Feature work
/// packages may extend it (add a method body here only for an endpoint that
/// still throws `unimplemented`), never change its seed data.
public actor FixtureWardrobeAPI: WardrobeAPI {
	public static let meID = "00000000-0000-4000-8000-000000000001"
	public static let friendID = "00000000-0000-4000-8000-000000000002"

	public var me: MeDTO
	public var locations: [LocationDTO]
	public var categories: [CategoryDTO]
	public var items: [ItemSummaryDTO]
	public var sharesList: [ShareDTO] = []
	public var sharedWithMeList: [SharedWithMeDTO] = []
	/// Calls made, as "METHOD path", for assertions.
	public private(set) var calls: [String] = []
	/// When set, the next call throws it.
	public var nextError: APIError?

	public init() {
		let now = Date(timeIntervalSince1970: 1_763_200_000)
		me = MeDTO(id: Self.meID, sub: "312345678901234567", email: "me@example.com", username: "me", groups: ["wardrobe"], isAdmin: false)
		let closet = LocationDTO(id: "10000000-0000-4000-8000-000000000001", ownerId: Self.meID, access: .owner, kind: .closet, code: "CL-BEDROOM", name: "Bedroom closet", createdAt: now, updatedAt: now, itemCount: 2)
		let bag = LocationDTO(id: "10000000-0000-4000-8000-000000000002", ownerId: Self.meID, access: .owner, kind: .bag, code: "B-07", name: "Winter knits", parentId: nil, createdAt: now, updatedAt: now, itemCount: 1)
		locations = [closet, bag]
		let tops = CategoryDTO(id: "20000000-0000-4000-8000-000000000001", name: "Tops", slug: "tops", sortOrder: 0)
		let knit = CategoryDTO(id: "20000000-0000-4000-8000-000000000002", name: "Knitwear", slug: "knitwear", parentId: tops.id, sortOrder: 0)
		categories = [tops, knit]
		let knitRef = CategoryRef(id: knit.id, name: knit.name, slug: knit.slug)
		items = [
			ItemSummaryDTO(id: "30000000-0000-4000-8000-000000000001", ownerId: Self.meID, access: .owner, name: "Navy cardigan", category: knitRef, brand: "Uniqlo", size: "M", colors: [ItemColor(name: "navy", hex: "#1f2a44", share: 0.9)], seasons: [.autumn, .winter], status: .stored, location: bag.ref, tags: ["wool"], createdAt: now, updatedAt: now),
			ItemSummaryDTO(id: "30000000-0000-4000-8000-000000000002", ownerId: Self.meID, access: .owner, name: "White shirt", brand: "COS", size: "M", colors: [ItemColor(name: "white", hex: "#f5f5f5", share: 0.95)], seasons: [.spring, .summer], status: .active, location: closet.ref, createdAt: now, updatedAt: now),
			ItemSummaryDTO(id: "30000000-0000-4000-8000-000000000003", ownerId: Self.meID, access: .owner, name: "Grey hoodie", status: .active, location: closet.ref, createdAt: now, updatedAt: now),
		]
	}

	public func setNextError(_ e: APIError?) { nextError = e }

	private func record(_ call: String) throws {
		calls.append(call)
		if let e = nextError { nextError = nil; throw e }
	}

	private static func unimplemented(_ what: String) -> APIError {
		APIError(status: 501, error: "unimplemented", message: "FixtureWardrobeAPI: \(what)")
	}

	private var now: Date { Date(timeIntervalSince1970: 1_763_200_000) }

	public func me() async throws -> MeDTO { try record("GET /me"); return me }
	public func health() async throws -> Bool { try record("GET /healthz"); return true }

	public func locations(_ query: LocationQuery) async throws -> [LocationDTO] {
		try record("GET /locations")
		return locations.filter { l in
			(query.kind == nil || l.kind == query.kind)
				&& (query.archived == true || l.archivedAt == nil)
				&& (query.q.map { q in l.name.localizedCaseInsensitiveContains(q) || l.code.localizedCaseInsensitiveContains(q) } ?? true)
		}
	}

	public func location(id: ID) async throws -> LocationDetailDTO {
		try record("GET /locations/\(id)")
		guard let l = locations.first(where: { $0.id == id }) else { throw APIError(status: 404, error: "not_found", message: "Location not found") }
		return LocationDetailDTO(
			id: l.id, ownerId: l.ownerId, access: l.access, kind: l.kind, code: l.code, name: l.name,
			notes: l.notes, parentId: l.parentId, archivedAt: l.archivedAt, createdAt: l.createdAt,
			updatedAt: l.updatedAt, itemCount: l.itemCount,
			items: items.filter { $0.location?.id == id }, children: locations.filter { $0.parentId == id })
	}

	public func location(code: String, owner: ID?) async throws -> LocationDTO {
		try record("GET /locations/by-code/\(code)")
		guard let l = locations.first(where: { $0.code == code && $0.ownerId == (owner ?? me.id) }) else {
			throw APIError(status: 404, error: "not_found", message: "Location not found")
		}
		return l
	}

	public func createLocation(_ body: CreateLocationRequest) async throws -> LocationDTO {
		try record("POST /locations")
		let l = LocationDTO(id: UUID().uuidString.lowercased(), ownerId: body.ownerId ?? me.id, access: .owner, kind: body.kind, code: normalizeLocationCode(body.code) ?? body.code, name: body.name, notes: body.notes, parentId: body.parentId, createdAt: now, updatedAt: now, itemCount: 0)
		locations.append(l)
		return l
	}

	public func updateLocation(id: ID, _ body: UpdateLocationRequest) async throws -> LocationDTO {
		try record("PATCH /locations/\(id)")
		guard let i = locations.firstIndex(where: { $0.id == id }) else { throw APIError(status: 404, error: "not_found", message: "Location not found") }
		if let k = body.kind { locations[i].kind = k }
		if let c = body.code { locations[i].code = c }
		if let n = body.name { locations[i].name = n }
		switch body.archivedAt { case .unset: break; case .null: locations[i].archivedAt = nil; case .value(let d): locations[i].archivedAt = d }
		return locations[i]
	}

	public func deleteLocation(id: ID) async throws {
		try record("DELETE /locations/\(id)")
		if items.contains(where: { $0.location?.id == id }) { throw APIError(status: 409, error: "conflict", message: "Location still holds items") }
		locations.removeAll { $0.id == id }
	}

	public func categories() async throws -> [CategoryDTO] { try record("GET /categories"); return categories }

	public func tags(owner: ID?) async throws -> [TagCountDTO] {
		try record("GET /tags")
		var counts: [String: Int] = [:]
		for t in items.flatMap(\.tags) { counts[t, default: 0] += 1 }
		return counts.map { TagCountDTO(name: $0.key, count: $0.value) }.sorted { $0.count > $1.count }
	}

	public func items(_ query: ItemQuery) async throws -> ItemListDTO {
		try record("GET /items")
		let list = items.filter { i in
			(query.q.map { q in (i.name ?? "").localizedCaseInsensitiveContains(q) } ?? true)
				&& (query.status == nil || i.status == query.status)
				&& (query.season.map { i.seasons.contains($0) } ?? true)
				&& (query.location.map { l in i.location?.id == l || i.location?.code == l } ?? true)
				&& (query.tag.map { i.tags.contains($0) } ?? true)
		}
		return ItemListDTO(items: list, nextCursor: nil)
	}

	public func item(id: ID) async throws -> ItemDetailDTO {
		try record("GET /items/\(id)")
		guard let s = items.first(where: { $0.id == id }) else { throw APIError(status: 404, error: "not_found", message: "Item not found") }
		return ItemDetailDTO(
			id: s.id, ownerId: s.ownerId, access: s.access, name: s.name, category: s.category, brand: s.brand,
			size: s.size, colors: s.colors, pattern: s.pattern, material: s.material, seasons: s.seasons,
			status: s.status, location: s.location, notes: s.notes, tags: s.tags, coverPhoto: s.coverPhoto,
			createdAt: s.createdAt, updatedAt: s.updatedAt, photos: [], movements: [], analyses: [])
	}

	public func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO {
		try record("POST /items")
		let loc = body.locationId.flatMap { id in locations.first { $0.id == id }?.ref }
		let item = ItemSummaryDTO(id: UUID().uuidString.lowercased(), ownerId: body.ownerId ?? me.id, access: .owner, name: body.name, brand: body.brand, size: body.size, seasons: body.seasons ?? [], status: body.status ?? .active, location: loc, notes: body.notes, tags: body.tags ?? [], createdAt: now, updatedAt: now)
		items.append(item)
		return item
	}

	public func updateItem(id: ID, _ body: UpdateItemRequest) async throws -> ItemSummaryDTO {
		try record("PATCH /items/\(id)")
		guard let i = items.firstIndex(where: { $0.id == id }) else { throw APIError(status: 404, error: "not_found", message: "Item not found") }
		switch body.name { case .unset: break; case .null: items[i].name = nil; case .value(let v): items[i].name = v }
		switch body.brand { case .unset: break; case .null: items[i].brand = nil; case .value(let v): items[i].brand = v }
		switch body.size { case .unset: break; case .null: items[i].size = nil; case .value(let v): items[i].size = v }
		switch body.notes { case .unset: break; case .null: items[i].notes = nil; case .value(let v): items[i].notes = v }
		if let s = body.status { items[i].status = s }
		if let s = body.seasons { items[i].seasons = s }
		if let t = body.tags { items[i].tags = t }
		switch body.locationId {
		case .unset: break
		case .null: items[i].location = nil
		case .value(let l): items[i].location = locations.first { $0.id == l }?.ref
		}
		return items[i]
	}

	public func deleteItem(id: ID) async throws { try record("DELETE /items/\(id)"); items.removeAll { $0.id == id } }

	public func moveItems(_ body: MoveItemsRequest) async throws -> MoveItemsResult {
		try record("POST /items/move")
		let to = body.toLocationId.flatMap { id in locations.first { $0.id == id } }
		var n = 0
		for i in items.indices where body.itemIds.contains(items[i].id) {
			items[i].location = to?.ref
			if let k = to?.kind { items[i].status = (k == .bag || k == .suitcase) ? .stored : (k == .closet || k == .drawer) ? .active : items[i].status }
			n += 1
		}
		return MoveItemsResult(moved: n)
	}

	public func analyses(itemId: ID) async throws -> [AnalysisDTO] { try record("GET /items/\(itemId)/analyses"); return [] }
	public func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] { try record("POST /items/\(itemId)/analyses"); throw Self.unimplemented("runAnalyses") }
	public func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO { try record("POST /items/\(itemId)/analyses/\(analysisId)/apply"); throw Self.unimplemented("applyAnalysis") }

	public func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO {
		try record("POST /photos")
		let id = UUID().uuidString.lowercased()
		let photo = PhotoDTO(id: id, ownerId: me.id, access: .owner, itemId: body.itemId, kind: body.kind, status: .pending, contentType: body.contentType, size: body.size, createdAt: now)
		return PhotoUploadDTO(photo: photo, uploadUrl: URL(string: "https://s3.example.com/photos/\(id)/original")!, uploadHeaders: ["Content-Type": body.contentType])
	}
	public func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws { try record("PUT \(url.path)") }
	public func completePhoto(id: ID) async throws -> PhotoDTO {
		try record("POST /photos/\(id)/complete")
		return PhotoDTO(id: id, ownerId: me.id, access: .owner, itemId: nil, kind: .main, status: .processing, contentType: "image/jpeg", size: 1, createdAt: now)
	}
	public func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO { try record("PATCH /photos/\(id)"); throw Self.unimplemented("updatePhoto") }
	public func deletePhoto(id: ID) async throws { try record("DELETE /photos/\(id)") }
	public func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? { try record("GET /photos/\(id)/\(variant)"); return nil }

	public func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO {
		try record("POST /sessions")
		return PackingSessionDTO(id: UUID().uuidString.lowercased(), ownerId: me.id, access: .owner, mode: body.mode, locationId: body.locationId, startedAt: now, endedAt: nil)
	}
	public func session(id: ID) async throws -> PackingSessionDetailDTO { try record("GET /sessions/\(id)"); throw Self.unimplemented("session") }
	public func endSession(id: ID) async throws -> PackingSessionDTO { try record("POST /sessions/\(id)/end"); throw Self.unimplemented("endSession") }

	public func shares() async throws -> [ShareDTO] { try record("GET /shares"); return sharesList }
	public func createShare(_ body: CreateShareRequest) async throws -> ShareDTO {
		try record("POST /shares")
		let share = ShareDTO(
			id: UUID().uuidString.lowercased(),
			ownerId: me.id,
			grantee: UserRef(id: Self.friendID, email: body.grantee.contains("@") ? body.grantee : nil, username: body.grantee.contains("@") ? nil : body.grantee),
			access: body.access,
			location: body.locationId.flatMap { locId in locations.first { $0.id == locId }?.ref },
			createdAt: now,
			updatedAt: now
		)
		sharesList.append(share)
		return share
	}
	public func updateShare(id: ID, access: ShareAccess) async throws -> ShareDTO {
		try record("PATCH /shares/\(id)")
		if let idx = sharesList.firstIndex(where: { $0.id == id }) {
			sharesList[idx].access = access
			sharesList[idx].updatedAt = now
			return sharesList[idx]
		}
		let share = ShareDTO(
			id: id,
			ownerId: me.id,
			grantee: UserRef(id: Self.friendID, email: "friend@example.com", username: "friend"),
			access: access,
			location: nil,
			createdAt: now,
			updatedAt: now
		)
		sharesList.append(share)
		return share
	}
	public func deleteShare(id: ID) async throws {
		try record("DELETE /shares/\(id)")
		sharesList.removeAll { $0.id == id }
	}
	public func sharedWithMe() async throws -> [SharedWithMeDTO] { try record("GET /shared-with-me"); return sharedWithMeList }
}
