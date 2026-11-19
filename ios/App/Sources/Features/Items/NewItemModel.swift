import Foundation
import Observation
import WardrobeKit

@MainActor
@Observable
final class NewItemModel {
	var name: String = ""
	var categoryId: ID? = nil
	var locationId: ID? = nil
	var ownerId: ID? = nil
	var notes: String = ""

	/// Photos picked so far, keyed by slot (Front, Back, Label, Details).
	private(set) var photos: [PhotoSlot: Data] = [:]
	/// Detail slots in the order they were added.
	private(set) var detailSlots: [PhotoSlot] = []

	var locations: [LocationDTO] = []
	var categories: [CategoryDTO] = []

	var isLoadingData: Bool = false
	var isCreating: Bool = false
	var errorMessage: String? = nil

	var showingCamera: Bool = false
	var showingPhotosPicker: Bool = false

	weak var appModel: AppModel?

	init(locationId: ID? = nil, ownerId: ID? = nil) {
		self.locationId = locationId
		self.ownerId = ownerId
	}

	var hasPhoto: Bool {
		!photos.isEmpty
	}

	/// Every slot to show: the fixed ones, then each detail.
	var slots: [PhotoSlot] {
		[.front, .back, .label] + detailSlots
	}

	/// Filled slots in upload order; the first one creates the item and
	/// becomes its cover.
	var orderedPhotos: [(slot: PhotoSlot, data: Data)] {
		slots.compactMap { slot in photos[slot].map { (slot, $0) } }
	}

	func setPhoto(_ data: Data, for slot: PhotoSlot) {
		if case .detail = slot, !detailSlots.contains(slot) {
			detailSlots.append(slot)
		}
		photos[slot] = data
	}

	func removePhoto(_ slot: PhotoSlot) {
		photos[slot] = nil
		detailSlots.removeAll { $0 == slot }
	}

	func loadData(api: any WardrobeAPI) async {
		isLoadingData = true
		defer { isLoadingData = false }

		do {
			async let locs = api.locations(LocationQuery(owner: ownerId))
			async let cats = api.categories()
			(locations, categories) = try await (locs, cats)
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func create(api: any WardrobeAPI, uploads: UploadQueue) async -> ID? {
		isCreating = true
		errorMessage = nil
		defer { isCreating = false }

		let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
		let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)

		let request = CreateItemRequest(
			name: trimmedName.isEmpty ? nil : trimmedName,
			categoryId: categoryId,
			locationId: locationId,
			notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
			ownerId: ownerId
		)

		do {
			let ordered = orderedPhotos
			if let first = ordered.first {
				// The first photo creates the item; the rest wait for it.
				let jobId = try uploads.enqueue(
					imageData: first.data,
					kind: first.slot.kind,
					target: .newItem(request),
					sessionId: nil
				)
				for photo in ordered.dropFirst() {
					try uploads.enqueue(
						imageData: photo.data,
						kind: photo.slot.kind,
						target: .afterJob(jobId),
						sessionId: nil
					)
				}
				return uploads.itemId(of: jobId)
			} else {
				let summary = try await api.createItem(request, idempotencyKey: UUID().uuidString)
				return summary.id
			}
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
			return nil
		}
	}
}

/// A place for one photo in the new-item form.
enum PhotoSlot: Hashable, Identifiable {
	case front, back, label
	case detail(UUID)

	var id: String {
		switch self {
		case .front: "front"
		case .back: "back"
		case .label: "label"
		case .detail(let id): "detail-\(id.uuidString)"
		}
	}

	var kind: PhotoKind {
		switch self {
		case .front: .main
		case .back: .back
		case .label: .label
		case .detail: .detail
		}
	}

	var title: String { kind.displayName }
}
