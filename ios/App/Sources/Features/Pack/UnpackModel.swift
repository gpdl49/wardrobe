import Foundation
import Observation
import WardrobeKit

/// Coordinates the unpack flow: selecting a source container, managing item selection,
/// moving items to target closets/drawers or unassigned, undoing moves, and ending the session.
@MainActor
@Observable
final class UnpackModel {
	enum Phase: Equatable {
		case loading
		case chooseSource
		case resuming(ActiveSession)
		case unpacking(source: LocationDetailDTO)
		case summary(sessionId: ID)
	}

	enum ScannerTarget {
		case source
		case destination
	}

	let api: any WardrobeAPI
	let userSub: String
	let ownerId: ID?
	let store: ActiveSessionStore

	var phase: Phase = .loading
	var sourceLocations: [LocationDTO] = []
	var destinationLocations: [LocationDTO] = []
	var items: [ItemSummaryDTO] = []
	var selectedItemIds: Set<ID> = []

	var isChoosingDestination = false
	var lastMove: (items: [ItemSummaryDTO], toLocation: LocationRef?)?
	var sessionId: ID?
	var sessionKey: String?

	var busy = false
	var isFinishing = false
	var errorMessage: String?
	var showScanner = false
	var scannerTarget: ScannerTarget = .source

	init(
		api: any WardrobeAPI,
		userSub: String,
		ownerId: ID? = nil,
		store: ActiveSessionStore = ActiveSessionStore()
	) {
		self.api = api
		self.userSub = userSub
		self.ownerId = ownerId
		self.store = store
	}

	func loadInitialData() async {
		phase = .loading
		let locs = (try? await api.locations(LocationQuery(owner: ownerId, archived: false))) ?? []
		self.sourceLocations = locs

		if let saved = store.load(userSub: userSub, mode: .unpack) {
			phase = .resuming(saved)
		} else {
			phase = .chooseSource
		}
	}

	func resumeActiveSession(_ active: ActiveSession) async {
		sessionId = active.session.id
		sessionKey = active.idempotencyKey

		do {
			let detail = try await api.location(id: active.location.id)
			items = detail.items
			selectedItemIds = []
			lastMove = nil
			phase = .unpacking(source: detail)
		} catch {
			errorMessage = "Could not resume session: \(error.localizedDescription)"
			phase = .chooseSource
		}
	}

	func discardActiveSession(_ active: ActiveSession) {
		store.clear(userSub: userSub, mode: .unpack)
		Task {
			try? await api.endSession(id: active.session.id)
		}
		sessionId = nil
		sessionKey = nil
		phase = .chooseSource
	}

	func chooseSourceLocation(_ location: LocationDTO) async {
		guard location.access != .view else {
			errorMessage = "You have view access to \(location.code)."
			return
		}

		busy = true
		errorMessage = nil
		do {
			let detail = try await api.location(id: location.id)
			items = detail.items
			selectedItemIds = []
			lastMove = nil
			sessionId = nil
			sessionKey = nil
			phase = .unpacking(source: detail)
			busy = false
		} catch {
			busy = false
			errorMessage = (error as? APIError)?.message ?? error.localizedDescription
		}
	}

	func toggleItemSelection(_ id: ID) {
		if selectedItemIds.contains(id) {
			selectedItemIds.remove(id)
		} else {
			selectedItemIds.insert(id)
		}
	}

	func selectAll() {
		selectedItemIds = Set(items.map(\.id))
	}

	func selectNone() {
		selectedItemIds.removeAll()
	}

	func prepareDestinationChoice() async {
		let locs = (try? await api.locations(LocationQuery(owner: ownerId, archived: false))) ?? []
		self.destinationLocations = locs
		self.isChoosingDestination = true
	}

	func ensureSession(source: LocationDetailDTO) async throws -> ID {
		if let sid = sessionId {
			return sid
		}
		let key = sessionKey ?? UUID().uuidString.lowercased()
		sessionKey = key

		let session = try await api.createSession(
			CreateSessionRequest(mode: .unpack, locationId: source.id),
			idempotencyKey: key
		)
		self.sessionId = session.id
		let active = ActiveSession(session: session, location: source.location.ref, idempotencyKey: key)
		store.save(userSub: userSub, mode: .unpack, active: active)
		return session.id
	}

	func moveSelectedItems(to destination: LocationDTO?, source: LocationDetailDTO) async {
		let moving = items.filter { selectedItemIds.contains($0.id) }
		guard !moving.isEmpty else { return }

		busy = true
		errorMessage = nil

		do {
			let sid = try await ensureSession(source: source)
			_ = try await api.moveItems(
				MoveItemsRequest(
					itemIds: moving.map(\.id),
					toLocationId: destination?.id,
					sessionId: sid
				)
			)
			items.removeAll { selectedItemIds.contains($0.id) }
			lastMove = (items: moving, toLocation: destination?.ref)
			selectedItemIds.removeAll()
			isChoosingDestination = false
			busy = false
		} catch {
			busy = false
			if let apiErr = error as? APIError, apiErr.status == 409, apiErr.error != "idempotency_in_progress" {
				sessionId = nil
				sessionKey = nil
			}
			errorMessage = (error as? APIError)?.message ?? error.localizedDescription
		}
	}

	func undoLastMove(source: LocationDetailDTO) async {
		guard let lm = lastMove else { return }

		busy = true
		errorMessage = nil

		do {
			_ = try await api.moveItems(
				MoveItemsRequest(
					itemIds: lm.items.map(\.id),
					toLocationId: source.id,
					sessionId: sessionId
				)
			)
			let returnedIds = Set(lm.items.map(\.id))
			items = lm.items + items.filter { !returnedIds.contains($0.id) }
			lastMove = nil
			busy = false
		} catch {
			busy = false
			errorMessage = (error as? APIError)?.message ?? error.localizedDescription
		}
	}

	func finishUnpacking() async {
		isFinishing = true
		store.clear(userSub: userSub, mode: .unpack)

		if let sid = sessionId {
			_ = try? await api.endSession(id: sid)
			isFinishing = false
			phase = .summary(sessionId: sid)
		} else {
			isFinishing = false
			resetToChoose()
		}
	}

	func resetToChoose() {
		phase = .chooseSource
		items = []
		selectedItemIds.removeAll()
		lastMove = nil
		sessionId = nil
		sessionKey = nil
	}

	func resolveScannedCode(_ text: String, baseURL: URL) async {
		let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
		guard !trimmed.isEmpty else { return }

		showScanner = false
		errorMessage = nil

		do {
			let resolvedLocation: LocationDTO
			if let url = URL(string: trimmed), let route = DeepLink.route(from: url, baseURL: baseURL) {
				switch route {
				case .label(let ownerId, let code):
					resolvedLocation = try await api.location(code: code, owner: ownerId)
				case .location(let id):
					let detail = try await api.location(id: id)
					resolvedLocation = LocationDTO(
						id: detail.id,
						ownerId: detail.ownerId,
						access: detail.access,
						kind: detail.kind,
						code: detail.code,
						name: detail.name,
						notes: detail.notes,
						parentId: detail.parentId,
						archivedAt: detail.archivedAt,
						createdAt: detail.createdAt,
						updatedAt: detail.updatedAt,
						itemCount: detail.itemCount
					)
				default:
					errorMessage = "Scanned QR code is not a location."
					return
				}
			} else if let code = normalizeLocationCode(trimmed) {
				resolvedLocation = try await api.location(code: code, owner: ownerId)
			} else {
				errorMessage = "Invalid location code: \(trimmed)"
				return
			}

			switch scannerTarget {
			case .source:
				await chooseSourceLocation(resolvedLocation)
			case .destination:
				if case .unpacking(let source) = phase {
					await moveSelectedItems(to: resolvedLocation, source: source)
				}
			}
		} catch {
			errorMessage = (error as? APIError)?.message ?? error.localizedDescription
		}
	}
}
