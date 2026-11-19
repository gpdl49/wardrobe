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
	public var photos: [PhotoDTO] = []
	public var analysesList: [AnalysisDTO] = []
	public var movements: [MovementDTO] = []
 private var outfitRecords: [OutfitDetailDTO] = []
 private var outfitKeys: [String: ID] = [:]
	/// The last bulk-apply body, for tests.
	public private(set) var lastBulkApply: BulkApplyRequest?
 private var runRecords: [SuggestionRunDTO] = []
 private var runKeys: [String: ID] = [:]
 private var connection = ImmichStatusDTO(enabled: true, connected: true, url: "https://immich.example.com", user: ImmichUserDTO(id: "immich-user", email: "me@example.com", name: "Me"))
 private var library: [ImmichAssetDTO] = [ImmichAssetDTO(id: "40000000-0000-4000-8000-000000000001", fileName: "outfit.jpg", width: 1200, height: 1600, thumbhash: nil, takenAt: nil, thumbUrl: "/api/immich/assets/40000000-0000-4000-8000-000000000001/thumb")]


	public func seedPhoto(_ photo: PhotoDTO) {
		photos.append(photo)
	}

	public func seedAnalysis(_ analysis: AnalysisDTO) {
		analysesList.append(analysis)
	}
	public var sessions: [PackingSessionDTO] = []
	public var sessionItemIDs: [ID: [ID]] = [:]
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
        let owner = UserRef(id: Self.meID, email: me.email, username: me.username)
        let selected = Array(items.prefix(2))
        outfitRecords = [OutfitDetailDTO(id: "50000000-0000-4000-8000-000000000001", ownerId: Self.meID, access: .owner, name: "Everyday layers", notes: nil, seasons: [.autumn], tags: ["wool"], itemCount: selected.count, previewItems: selected.map { OutfitItemRef(id: $0.id, name: $0.name, coverPhoto: $0.coverPhoto) }, cover: nil, createdAt: now, updatedAt: now, owner: owner, items: selected, photos: [], shares: [])]
        let runID = "60000000-0000-4000-8000-000000000001"
        let suggestion = OutfitSuggestionDTO(id: "70000000-0000-4000-8000-000000000001", runId: runID, name: "Casual layers", rationale: "Comfortable layers", items: selected, feedback: nil, outfitId: nil, createdAt: now)
        runRecords = [SuggestionRunDTO(id: runID, ownerId: Self.meID, status: .done, request: SuggestionRequest(), model: "fixture", error: nil, createdAt: now, updatedAt: now, suggestions: [suggestion])]
        me.features = FeaturesDTO(vision: true, suggestions: true, immich: true)
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
			createdAt: s.createdAt, updatedAt: s.updatedAt,
			photos: photos.filter { $0.itemId == id },
			movements: movements.filter { $0.from?.id == s.location?.id || $0.to?.id == s.location?.id },
			analyses: analysesList.filter { $0.itemId == id })
	}

	public func createItem(_ body: CreateItemRequest, idempotencyKey: String) async throws -> ItemSummaryDTO {
		try record("POST /items")
		let loc = body.locationId.flatMap { id in locations.first { $0.id == id }?.ref }
		let item = ItemSummaryDTO(id: UUID().uuidString.lowercased(), ownerId: body.ownerId ?? me.id, access: .owner, name: body.name, brand: body.brand, size: body.size, seasons: body.seasons ?? [], status: body.status ?? .active, location: loc, notes: body.notes, tags: body.tags ?? [], createdAt: now, updatedAt: now)
		items.append(item)
		if let sid = body.sessionId {
			var current = sessionItemIDs[sid] ?? []
			current.append(item.id)
			sessionItemIDs[sid] = current
		}
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
		switch body.coverPhotoId {
		case .unset: break
		case .null: items[i].coverPhoto = nil
		case .value(let photoId): items[i].coverPhoto = photos.first { $0.id == photoId }
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
			if let k = to?.kind { items[i].status = LocationKind.packContainers.contains(k) ? .stored : (k == .closet || k == .drawer) ? .active : items[i].status }
			n += 1
		}
		if let sid = body.sessionId {
			var current = sessionItemIDs[sid] ?? []
			for id in body.itemIds where !current.contains(id) {
				current.append(id)
			}
			sessionItemIDs[sid] = current
		}
		return MoveItemsResult(moved: n)
	}

	public func analyses(itemId: ID) async throws -> [AnalysisDTO] {
		try record("GET /items/\(itemId)/analyses")
		return analysesList.filter { $0.itemId == itemId }
	}

	public func runAnalyses(itemId: ID, kinds: [AnalysisKind]?) async throws -> [AnalysisDTO] {
		try record("POST /items/\(itemId)/analyses")
		guard items.contains(where: { $0.id == itemId }) else {
			throw APIError(status: 404, error: "not_found", message: "Item not found")
		}
		let selectedKinds = kinds ?? [.colors, .vision]
		var created: [AnalysisDTO] = []
		for kind in selectedKinds {
			let id = UUID().uuidString.lowercased()
			let suggestion: ItemSuggestion
			if kind == .colors {
				suggestion = ItemSuggestion(colors: [ItemColor(name: "navy", hex: "#1f2a44", share: 0.85)])
			} else {
				suggestion = ItemSuggestion(
					name: "Suggested Cardigan",
					categorySlug: "knitwear",
					brand: "Uniqlo",
					seasons: [.autumn, .winter],
					tags: ["merino", "warm"]
				)
			}
			let a = AnalysisDTO(
				id: id,
				itemId: itemId,
				kind: kind,
				model: "gemini-vision-2.5",
				status: .done,
				result: suggestion,
				createdAt: now,
				updatedAt: now
			)
			created.append(a)
			analysesList.append(a)
		}
		return created
	}

	public func applyAnalysis(itemId: ID, analysisId: ID, fields: [ItemSuggestion.Field]) async throws -> ItemDetailDTO {
		try record("POST /items/\(itemId)/analyses/\(analysisId)/apply")
		guard let itemIndex = items.firstIndex(where: { $0.id == itemId }) else {
			throw APIError(status: 404, error: "not_found", message: "Item not found")
		}
		guard let aIndex = analysesList.firstIndex(where: { $0.id == analysisId && $0.itemId == itemId }) else {
			throw APIError(status: 404, error: "not_found", message: "Analysis not found")
		}
		guard let suggestion = analysesList[aIndex].result else {
			throw APIError(status: 400, error: "no_result", message: "Analysis has no result to apply")
		}
		for field in fields {
			switch field {
			case .name:
				if let name = suggestion.name { items[itemIndex].name = name }
			case .categorySlug:
				if let slug = suggestion.categorySlug, let cat = categories.first(where: { $0.slug == slug }) {
					items[itemIndex].category = CategoryRef(id: cat.id, name: cat.name, slug: cat.slug)
				}
			case .brand:
				if let brand = suggestion.brand { items[itemIndex].brand = brand }
			case .size:
				if let size = suggestion.size { items[itemIndex].size = size }
			case .colors:
				if let colors = suggestion.colors { items[itemIndex].colors = colors }
			case .pattern:
				if let pattern = suggestion.pattern { items[itemIndex].pattern = pattern }
			case .material:
				if let material = suggestion.material { items[itemIndex].material = material }
			case .seasons:
				if let seasons = suggestion.seasons { items[itemIndex].seasons = seasons }
			case .tags:
				if let tags = suggestion.tags {
					var existing = items[itemIndex].tags
					for t in tags where !existing.contains(t) { existing.append(t) }
					items[itemIndex].tags = existing
				}
			case .labelText:
				if let labelText = suggestion.labelText {
					let current = items[itemIndex].notes ?? ""
					items[itemIndex].notes = current.isEmpty ? labelText : "\(current)\n\(labelText)"
				}
			}
		}
		analysesList[aIndex].appliedAt = now
		return try await item(id: itemId)
	}

	public func createPhoto(_ body: CreatePhotoRequest, idempotencyKey: String) async throws -> PhotoUploadDTO {
		try record("POST /photos")
		let id = UUID().uuidString.lowercased()
		let photo = PhotoDTO(id: id, ownerId: me.id, access: .owner, itemId: body.itemId, outfitId: body.outfitId, kind: body.kind, status: .pending, contentType: body.contentType, size: body.size, createdAt: now)
		photos.append(photo)
		return PhotoUploadDTO(photo: photo, uploadUrl: URL(string: "https://s3.example.com/photos/\(id)/original")!, uploadHeaders: ["Content-Type": body.contentType])
	}
	public func uploadPhoto(_ data: Data, to url: URL, headers: [String: String]) async throws { try record("PUT \(url.path)") }
	public func completePhoto(id: ID) async throws -> PhotoDTO {
		try record("POST /photos/\(id)/complete")
		guard let index = photos.firstIndex(where: { $0.id == id }) else { throw APIError(status: 404, error: "not_found", message: "Photo not found") }
        photos[index].status = .processing
        let photo = photos[index]
        if let outfitId = photo.outfitId, let outfitIndex = outfitRecords.firstIndex(where: { $0.id == outfitId }), !outfitRecords[outfitIndex].photos.contains(where: { $0.id == id }) {
            let path = "/api/photos/\(id)"
            outfitRecords[outfitIndex].photos.append(OutfitPhotoDTO(id: id, source: .upload, status: .processing, width: nil, height: nil, blurhash: nil, thumbhash: nil, assetId: nil, takenAt: nil, createdAt: now, urls: ["thumb": "\(path)/thumb", "display": "\(path)/display"]))
        }
        return photo
	}
	public func removePhotoBackground(id: ID) async throws -> PhotoDTO {
		try record("POST /photos/\(id)/background")
		guard let index = photos.firstIndex(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Photo not found")
		}
		photos[index].backgroundStatus = .ready
		return photos[index]
	}

	public func updatePhoto(id: ID, _ body: UpdatePhotoRequest) async throws -> PhotoDTO {
		try record("PATCH /photos/\(id)")
		guard let i = photos.firstIndex(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Photo not found")
		}
		switch body.itemId {
		case .unset: break
		case .null: photos[i].itemId = nil
		case .value(let val): photos[i].itemId = val
		}
		if let k = body.kind { photos[i].kind = k }
		return photos[i]
	}
	public func deletePhoto(id: ID) async throws {
		try record("DELETE /photos/\(id)")
		photos.removeAll { $0.id == id }
        for i in outfitRecords.indices { outfitRecords[i].photos.removeAll { $0.id == id } }
	}
	public func photoURL(id: ID, variant: PhotoVariant) async throws -> URL? { try record("GET /photos/\(id)/\(variant)"); return nil }

	public func createSession(_ body: CreateSessionRequest, idempotencyKey: String) async throws -> PackingSessionDTO {
		try record("POST /sessions")
		let session = PackingSessionDTO(id: UUID().uuidString.lowercased(), ownerId: me.id, access: .owner, mode: body.mode, locationId: body.locationId, startedAt: now, endedAt: nil)
		sessions.append(session)
		return session
	}
	public func session(id: ID) async throws -> PackingSessionDetailDTO {
		try record("GET /sessions/\(id)")
		guard let sess = sessions.first(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Session not found")
		}
		let loc = locations.first(where: { $0.id == sess.locationId })?.ref ?? LocationRef(id: sess.locationId, kind: .other, code: "LOC", name: "Location")
		let movedItems: [ItemSummaryDTO]
		if let ids = sessionItemIDs[id] {
			movedItems = items.filter { ids.contains($0.id) }
		} else {
			movedItems = items.filter { $0.location?.id == sess.locationId }
		}
		return PackingSessionDetailDTO(
			id: sess.id, ownerId: sess.ownerId, access: sess.access, mode: sess.mode,
			locationId: sess.locationId, startedAt: sess.startedAt, endedAt: sess.endedAt,
			location: loc, items: movedItems
		)
	}
	public func endSession(id: ID) async throws -> PackingSessionDTO {
		try record("POST /sessions/\(id)/end")
		guard let idx = sessions.firstIndex(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Session not found")
		}
		sessions[idx].endedAt = now
		return sessions[idx]
	}

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

// MARK: - Outfits, Immich and suggestions
extension FixtureWardrobeAPI {
	public func outfits(_ query: OutfitQuery) async throws -> OutfitListDTO {
		try record("GET /outfits")
		let filtered = outfitRecords.filter {
			(query.owner == nil || $0.ownerId == query.owner)
				&& (query.q == nil || $0.name.localizedCaseInsensitiveContains(query.q!))
				&& (query.item == nil || $0.items.contains { $0.id == query.item })
				&& (query.tag == nil || $0.tags.contains(query.tag!))
				&& (query.season == nil || $0.seasons.contains(query.season!))
		}
		return OutfitListDTO(outfits: filtered.map(summary), nextCursor: nil)
	}
	private func summary(_ o: OutfitDetailDTO) -> OutfitSummaryDTO {
		OutfitSummaryDTO(
			id: o.id, ownerId: o.ownerId, access: o.access, name: o.name, notes: o.notes,
			seasons: o.seasons, tags: o.tags, itemCount: o.items.count, previewItems: o.previewItems,
			cover: o.photos.first, createdAt: o.createdAt, updatedAt: o.updatedAt)
	}
	public func sharedOutfits() async throws -> [OutfitSummaryDTO] {
		try record("GET /outfits/shared-with-me")
		return []
	}
	public func outfit(id: ID) async throws -> OutfitDetailDTO {
		try record("GET /outfits/\(id)")
		guard let o = outfitRecords.first(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Outfit not found")
		}
		return o
	}
	public func createOutfit(_ body: CreateOutfitRequest, idempotencyKey: String) async throws -> OutfitDetailDTO {
		try record("POST /outfits")
		if let id = outfitKeys[idempotencyKey], let existing = outfitRecords.first(where: { $0.id == id }) {
			return existing
		}
		let selected = (body.itemIds ?? []).compactMap { id in items.first { $0.id == id } }
		let o = OutfitDetailDTO(
			id: UUID().uuidString, ownerId: body.ownerId ?? me.id, access: .owner, name: body.name,
			notes: body.notes, seasons: body.seasons ?? [], tags: body.tags ?? [],
			itemCount: selected.count,
			previewItems: selected.map {
				OutfitItemRef(id: $0.id, name: $0.name, coverPhoto: $0.coverPhoto)
			}, cover: nil, createdAt: now, updatedAt: now,
			owner: UserRef(id: me.id, email: me.email, username: me.username), items: selected, photos: [],
			shares: [])
		outfitRecords.insert(o, at: 0)
		outfitKeys[idempotencyKey] = o.id
		if let id = body.suggestionId {
			for i in runRecords.indices {
				if let j = runRecords[i].suggestions.firstIndex(where: { $0.id == id }) {
					runRecords[i].suggestions[j].feedback = .saved
					runRecords[i].suggestions[j].outfitId = o.id
				}
			}
		}
		return o
	}
	public func updateOutfit(id: ID, _ body: UpdateOutfitRequest) async throws -> OutfitDetailDTO {
		try record("PATCH /outfits/\(id)")
		guard let i = outfitRecords.firstIndex(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Outfit not found")
		}
		if let name = body.name { outfitRecords[i].name = name }
		switch body.notes {
		case .unset: break
		case .null: outfitRecords[i].notes = nil
		case .value(let notes): outfitRecords[i].notes = notes
		}
		if let seasons = body.seasons { outfitRecords[i].seasons = seasons }
		if let tags = body.tags { outfitRecords[i].tags = tags }
		if let ids = body.itemIds {
			let selected = ids.compactMap { id in items.first { $0.id == id } }
			outfitRecords[i].items = selected
			outfitRecords[i].readableItemIds = selected.map(\.id)
			outfitRecords[i].itemCount = selected.count
			outfitRecords[i].previewItems = selected.map {
				OutfitItemRef(id: $0.id, name: $0.name, coverPhoto: $0.coverPhoto)
			}
		}
		return outfitRecords[i]
	}
	public func deleteOutfit(id: ID) async throws {
		try record("DELETE /outfits/\(id)")
		outfitRecords.removeAll { $0.id == id }
	}
	public func createOutfitShare(outfitId: ID, _ body: CreateOutfitShareRequest) async throws -> OutfitShareDTO {
		try record("POST /outfits/\(outfitId)/shares")
		guard let i = outfitRecords.firstIndex(where: { $0.id == outfitId }) else {
			throw APIError(status: 404, error: "not_found", message: "Outfit not found")
		}
		let share = OutfitShareDTO(
			id: UUID().uuidString, grantee: UserRef(id: Self.friendID, email: body.grantee, username: nil),
			createdAt: now)
		outfitRecords[i].shares.append(share)
		return share
	}
	public func deleteOutfitShare(outfitId: ID, shareId: ID) async throws {
		try record("DELETE /outfits/\(outfitId)/shares/\(shareId)")
		if let i = outfitRecords.firstIndex(where: { $0.id == outfitId }) {
			outfitRecords[i].shares.removeAll { $0.id == shareId }
		}
	}
	public func immichStatus() async throws -> ImmichStatusDTO {
		try record("GET /immich")
		return connection
	}
	public func connectImmich(_ body: ConnectImmichRequest) async throws -> ImmichStatusDTO {
		try record("PUT /immich")
		connection.connected = true
		connection.user = ImmichUserDTO(id: "immich-user", email: "me@example.com", name: "Me")
		return connection
	}
	public func disconnectImmich() async throws {
		try record("DELETE /immich")
		connection.connected = false
		connection.user = nil
	}
	public func immichAssets(_ query: ImmichAssetQuery) async throws -> ImmichAssetListDTO {
		try record("GET /immich/assets")
		return ImmichAssetListDTO(
			assets: library.filter {
				query.q == nil || ($0.fileName?.localizedCaseInsensitiveContains(query.q!) ?? false)
			}, nextCursor: nil)
	}
	public func immichThumbnail(assetId: ID) async throws -> Data? {
		try record("GET /immich/assets/\(assetId)/thumb")
		return library.contains(where: { $0.id == assetId }) ? fixtureImage : nil
	}
	private var fixtureImage: Data {
		Data(
			base64Encoded:
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aAAAAABJRU5ErkJggg=="
		)!
	}
	public func outfitImmichImage(outfitId: ID, linkId: ID, variant: PhotoVariant) async throws -> Data? {
		try record("GET /outfits/\(outfitId)/immich-assets/\(linkId)/\(variant.rawValue)")
		guard connection.connected, let outfit = outfitRecords.first(where: { $0.id == outfitId }),
			outfit.photos.contains(where: { $0.id == linkId && $0.source == .immich })
		else { return nil }
		return fixtureImage
	}
	public func linkImmichAssets(outfitId: ID, _ body: LinkImmichAssetsRequest) async throws -> [OutfitPhotoDTO] {
		try record("POST /outfits/\(outfitId)/immich-assets")
		guard let i = outfitRecords.firstIndex(where: { $0.id == outfitId }) else {
			throw APIError(status: 404, error: "not_found", message: "Outfit not found")
		}
		return body.assetIds.compactMap { id in
			if let existing = outfitRecords[i].photos.first(where: { $0.assetId == id }) { return existing }
			guard let a = library.first(where: { $0.id == id }) else { return nil }
			let link = UUID().uuidString
			let photo = OutfitPhotoDTO(
				id: link, source: .immich, status: .ready, width: a.width, height: a.height,
				blurhash: nil, thumbhash: a.thumbhash, assetId: id, takenAt: a.takenAt, createdAt: now,
				urls: [
					"thumb": "/api/outfits/\(outfitId)/immich-assets/\(link)/thumb",
					"display": "/api/outfits/\(outfitId)/immich-assets/\(link)/display",
				])
			outfitRecords[i].photos.append(photo)
			return photo
		}
	}
	public func unlinkImmichAsset(outfitId: ID, linkId: ID) async throws {
		try record("DELETE /outfits/\(outfitId)/immich-assets/\(linkId)")
		if let i = outfitRecords.firstIndex(where: { $0.id == outfitId }) {
			outfitRecords[i].photos.removeAll { $0.id == linkId }
		}
	}
	public func suggestionRuns(owner: ID?) async throws -> [SuggestionRunDTO] {
		try record("GET /suggestion-runs")
		return runRecords.filter { owner == nil || $0.ownerId == owner }
	}
	public func suggestionRun(id: ID) async throws -> SuggestionRunDTO {
		try record("GET /suggestion-runs/\(id)")
		guard let run = runRecords.first(where: { $0.id == id }) else {
			throw APIError(status: 404, error: "not_found", message: "Run not found")
		}
		return run
	}
	public func createSuggestionRun(_ body: CreateSuggestionRunRequest, idempotencyKey: String) async throws
		-> SuggestionRunDTO
	{
		try record("POST /suggestion-runs")
		if let id = runKeys[idempotencyKey], let run = runRecords.first(where: { $0.id == id }) { return run }
		let id = UUID().uuidString
		let proposal = OutfitSuggestionDTO(
			id: UUID().uuidString, runId: id, name: "Everyday", rationale: "A simple combination",
			items: Array(items.prefix(2)), feedback: nil, outfitId: nil, createdAt: now)
		let run = SuggestionRunDTO(
			id: id, ownerId: body.ownerId ?? me.id, status: .done,
			request: SuggestionRequest(
				prompt: body.prompt, season: body.season, itemIds: body.itemIds, count: body.count),
			model: "fixture", error: nil, createdAt: now, updatedAt: now, suggestions: [proposal])
		runRecords.insert(run, at: 0)
		runKeys[idempotencyKey] = id
		return run
	}
	public func dismissSuggestion(id: ID) async throws -> OutfitSuggestionDTO {
		try record("POST /outfit-suggestions/\(id)/dismiss")
		for i in runRecords.indices {
			if let j = runRecords[i].suggestions.firstIndex(where: { $0.id == id }) {
				if runRecords[i].suggestions[j].feedback == .saved {
					throw APIError(status: 409, error: "conflict", message: "Already saved")
				}
				runRecords[i].suggestions[j].feedback = .dismissed
				return runRecords[i].suggestions[j]
			}
		}
		throw APIError(status: 404, error: "not_found", message: "Suggestion not found")
	}
	public func queueBulkAnalyses(_ body: BulkItemsRequest) async throws -> BulkAnalysesDTO {
		try record("POST /items/analyses")
		return BulkAnalysesDTO(queued: 0)
	}
	public func applyBulkTags(_ body: BulkApplyRequest) async throws -> BulkApplyTagsDTO {
		try record("POST /items/analyses/apply-tags")
		lastBulkApply = body
		return BulkApplyTagsDTO(updated: 0)
	}
}
