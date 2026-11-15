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

	var capturedPhotoData: Data? = nil
	var photoKind: PhotoKind = .main

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
		capturedPhotoData != nil
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
			if let photoData = capturedPhotoData {
				let jobId = try uploads.enqueue(
					imageData: photoData,
					kind: photoKind,
					target: .newItem(request),
					sessionId: nil
				)
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
