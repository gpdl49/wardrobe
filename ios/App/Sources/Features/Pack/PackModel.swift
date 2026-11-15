import Foundation
import Observation
import WardrobeKit

/// Coordinates the pack flow: choosing/scanning a location, starting a session,
/// rapid capture via UploadQueue, quick item metadata, and session conclusion.
@MainActor
@Observable
final class PackModel {
	enum Phase: Equatable {
		case loading
		case chooseLocation
		case resuming(ActiveSession)
		case starting(location: LocationRef, key: String)
		case capturing(active: ActiveSession)
		case summary(sessionId: ID)
	}

	let api: any WardrobeAPI
	let uploads: UploadQueue
	let userSub: String
	let ownerId: ID?
	let store: ActiveSessionStore

	var phase: Phase = .loading
	var locations: [LocationDTO] = []
	var categories: [CategoryDTO] = []
	var selectedJobId: UUID?
	var quickName = ""
	var quickCategoryId: ID?
	var addedExistingItems: [ItemSummaryDTO] = []

	var showScanner = false
	var showExistingItemSearch = false
	var isStarting = false
	var isFinishing = false
	var errorMessage: String?
	weak var appModel: AppModel?

	init(
		api: any WardrobeAPI,
		uploads: UploadQueue,
		userSub: String,
		ownerId: ID? = nil,
		store: ActiveSessionStore = ActiveSessionStore()
	) {
		self.api = api
		self.uploads = uploads
		self.userSub = userSub
		self.ownerId = ownerId
		self.store = store
	}

	/// Checks for a saved session or prepares location selection.
	func loadInitialData() async {
		phase = .loading
		do {
			async let locs = api.locations(LocationQuery(owner: ownerId, archived: false))
			async let cats = api.categories()
			(locations, categories) = try await (locs, cats)
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}

		if let saved = store.load(userSub: userSub, mode: .pack) {
			phase = .resuming(saved)
		} else {
			phase = .chooseLocation
		}
	}

	func resumeActiveSession(_ active: ActiveSession) {
		phase = .capturing(active: active)
	}

	func discardActiveSession(_ active: ActiveSession) async {
		do {
			_ = try await api.endSession(id: active.session.id)
			store.clear(userSub: userSub, mode: .pack)
			phase = .chooseLocation
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func chooseLocation(_ location: LocationDTO) {
		guard location.access != .view else {
			errorMessage = "You have view access to \(location.code)."
			return
		}
		let key = UUID().uuidString.lowercased()
		Task {
			await startSession(location: location.ref, key: key)
		}
	}

	func startSession(location: LocationRef, key: String) async {
		phase = .starting(location: location, key: key)
		isStarting = true
		errorMessage = nil

		do {
			let session = try await api.createSession(
				CreateSessionRequest(mode: .pack, locationId: location.id),
				idempotencyKey: key
			)
			let active = ActiveSession(session: session, location: location, idempotencyKey: key)
			store.save(userSub: userSub, mode: .pack, active: active)
			phase = .capturing(active: active)
			isStarting = false
		} catch {
			isStarting = false
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func retryStart() async {
		if case .starting(let location, let key) = phase {
			await startSession(location: location, key: key)
		}
	}

	func cancelStart() {
		phase = .chooseLocation
		errorMessage = nil
	}

	func capturePhoto(data: Data) {
		guard case .capturing(let active) = phase else { return }

		do {
			let target = UploadTarget.newItem(
				CreateItemRequest(
					locationId: active.location.id,
					sessionId: active.session.id
				)
			)
			let jobId = try uploads.enqueue(
				imageData: data,
				kind: .main,
				target: target,
				sessionId: active.session.id
			)
			selectedJobId = jobId
			quickName = ""
			quickCategoryId = nil
		} catch {
			errorMessage = "Failed to queue photo: \(error.localizedDescription)"
		}
	}

	func captureLabelPhoto(data: Data) {
		guard case .capturing(let active) = phase, let selectedJobId else { return }

		do {
			guard let itemId = uploads.itemId(of: selectedJobId) else {
				errorMessage = "Wait for the item to be created before adding its label photo."
				return
			}
			_ = try uploads.enqueue(
				imageData: data,
				kind: .label,
				target: .item(itemId),
				sessionId: active.session.id
			)
		} catch {
			errorMessage = "Failed to queue label photo: \(error.localizedDescription)"
		}
	}

	func updateQuickFields(name: String, categoryId: ID?) {
		guard case .capturing(let active) = phase, let selectedJobId else { return }
		quickName = name
		quickCategoryId = categoryId

		let trimmed = name.trimmingCharacters(in: .whitespaces)
		uploads.updateNewItemFields(
			jobId: selectedJobId,
			CreateItemRequest(
				name: trimmed.isEmpty ? nil : trimmed,
				categoryId: categoryId,
				locationId: active.location.id,
				sessionId: active.session.id
			)
		)
	}

	func selectJob(_ jobId: UUID) {
		selectedJobId = jobId
		if let job = uploads.jobs.first(where: { $0.id == jobId }) {
			if case .newItem(let req) = job.target {
				quickName = req.name ?? ""
				quickCategoryId = req.categoryId
			}
		}
	}

	func finishPacking() async {
		guard case .capturing(let active) = phase else { return }
		isFinishing = true
		do {
			_ = try await api.endSession(id: active.session.id)
			store.clear(userSub: userSub, mode: .pack)
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
			isFinishing = false
			return
		}

		isFinishing = false
		phase = .summary(sessionId: active.session.id)
	}

	func resetToChoose() {
		phase = .chooseLocation
		selectedJobId = nil
		quickName = ""
		quickCategoryId = nil
		addedExistingItems = []
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

			chooseLocation(resolvedLocation)
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func sessionCaptures(sessionId: ID) -> [UploadJob] {
		uploads.jobs.filter { $0.sessionId == sessionId && isCreateItemJob($0) }
	}

	private func isCreateItemJob(_ job: UploadJob) -> Bool {
		if case .newItem = job.target { return true }
		return false
	}
}
