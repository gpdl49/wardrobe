import Foundation
import Observation
import WardrobeKit

@MainActor
@Observable
final class ItemDetailModel {
	let itemId: ID
	let api: any WardrobeAPI

	var item: ItemDetailDTO?
	var categories: [CategoryDTO] = []
	var isLoading: Bool = false
	var errorMessage: String? = nil

	var selectedPhotoIndex: Int = 0
	var isEditing: Bool = false

	var isShowingDeleteAlert: Bool = false
	var isDeleting: Bool = false
	var isDeleted: Bool = false
	var deleteError: String? = nil

	var isRerunningAnalyses: Bool = false
	var analysisMessage: String? = nil
	var pendingSuggestionFields: [ID: Set<ItemSuggestion.Field>] = [:]

	// Photo actions
	var isAddingPhoto: Bool = false
	var showingCamera: Bool = false
	var showingPhotosPicker: Bool = false
	var pendingPhotoData: Data? = nil
	var showingKindSelection: Bool = false
	var selectedKind: PhotoKind = .main
	var photoToDelete: PhotoDTO? = nil

	// Polling
	private(set) var pollTask: Task<Void, Never>? = nil
	var isPolling: Bool { pollTask != nil }

	/// Set from the view so `signed_out` ends the session instead of showing a generic alert.
	weak var appModel: AppModel?

	init(itemId: ID, api: any WardrobeAPI) {
		self.itemId = itemId
		self.api = api
	}

	var canEdit: Bool {
		item?.access.canEdit ?? false
	}

	/// Sorted photos: cover photo first, then by createdAt ascending.
	var sortedPhotos: [PhotoDTO] {
		guard let item else { return [] }
		let coverId = item.coverPhoto?.id
		return item.photos.sorted { a, b in
			if a.id == coverId { return true }
			if b.id == coverId { return false }
			return a.createdAt < b.createdAt
		}
	}

	func load() async {
		isLoading = true
		errorMessage = nil
		defer { isLoading = false }

		do {
			async let itemDetail = api.item(id: itemId)
			async let catList = api.categories()

			let (loadedItem, cats) = try await (itemDetail, catList)
			self.item = loadedItem
			self.categories = cats

			if selectedPhotoIndex >= sortedPhotos.count {
				selectedPhotoIndex = max(0, sortedPhotos.count - 1)
			}

			startPollingIfNeeded()
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func refresh() async {
		do {
			self.item = try await api.item(id: itemId)
			if selectedPhotoIndex >= sortedPhotos.count {
				selectedPhotoIndex = max(0, sortedPhotos.count - 1)
			}
			startPollingIfNeeded()
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func startPollingIfNeeded() {
		guard pollTask == nil else { return }
		guard let item, item.photos.contains(where: { $0.status == .pending || $0.status == .processing }) else {
			return
		}

		pollTask = Task { [weak self] in
			var elapsed: TimeInterval = 0
			let interval: TimeInterval = 2.0
			let maxDuration: TimeInterval = 60.0

			while !Task.isCancelled && elapsed < maxDuration {
				try? await Task.sleep(nanoseconds: 2_000_000_000)
				guard !Task.isCancelled else { break }
				elapsed += interval

				guard let self else { break }
				await self.refresh()

				let stillProcessing = self.item?.photos.contains(where: { $0.status == .pending || $0.status == .processing }) ?? false
				if !stillProcessing {
					break
				}
			}
			self?.pollTask = nil
		}
	}

	func stopPolling() {
		pollTask?.cancel()
		pollTask = nil
	}

	func setCoverPhoto(photoId: ID) async {
		do {
			var patch = UpdateItemRequest()
			patch.coverPhotoId = .value(photoId)
			_ = try await api.updateItem(id: itemId, patch)
			await refresh()
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func changePhotoKind(photoId: ID, kind: PhotoKind) async {
		do {
			_ = try await api.updatePhoto(id: photoId, UpdatePhotoRequest(kind: kind))
			await refresh()
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func deletePhoto(photoId: ID) async {
		do {
			try await api.deletePhoto(id: photoId)
			await refresh()
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func handleImagePicked(_ data: Data) {
		pendingPhotoData = data
		showingKindSelection = true
	}

	func confirmPhotoUpload(uploads: UploadQueue) {
		guard let data = pendingPhotoData else { return }
		let kind = selectedKind
		pendingPhotoData = nil
		showingKindSelection = false

		do {
			try uploads.enqueue(imageData: data, kind: kind, target: .item(itemId), sessionId: nil)
			Task {
				await refresh()
				startPollingIfNeeded()
			}
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func rerunAnalyses() async {
		isRerunningAnalyses = true
		analysisMessage = nil
		defer { isRerunningAnalyses = false }

		do {
			_ = try await api.runAnalyses(itemId: itemId, kinds: nil)
			await refresh()
		} catch {
			let described = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
			if (error as? APIError)?.status == 409 || described == "Vision disabled" {
				analysisMessage = "Vision analysis is disabled on this server."
			} else {
				analysisMessage = userFacingAPIError(error, appModel: appModel)
			}
		}
	}

	func applySuggestion(analysisId: ID, fields: [ItemSuggestion.Field]) async {
		var set = pendingSuggestionFields[analysisId] ?? []
		for f in fields { set.insert(f) }
		pendingSuggestionFields[analysisId] = set

		defer {
			var updated = pendingSuggestionFields[analysisId] ?? []
			for f in fields { updated.remove(f) }
			if updated.isEmpty {
				pendingSuggestionFields.removeValue(forKey: analysisId)
			} else {
				pendingSuggestionFields[analysisId] = updated
			}
		}

		do {
			self.item = try await api.applyAnalysis(itemId: itemId, analysisId: analysisId, fields: fields)
		} catch {
			errorMessage = userFacingAPIError(error, appModel: appModel)
		}
	}

	func deleteItem() async -> Bool {
		isDeleting = true
		deleteError = nil
		defer { isDeleting = false }

		do {
			try await api.deleteItem(id: itemId)
			isDeleted = true
			return true
		} catch {
			deleteError = userFacingAPIError(error, appModel: appModel)
			return false
		}
	}
}
