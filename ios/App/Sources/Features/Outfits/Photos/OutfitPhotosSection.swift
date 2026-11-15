import PhotosUI
import SwiftUI
import WardrobeKit

/// Photo actions for an outfit.
@MainActor @Observable
final class OutfitPhotosModel {
	let api: any WardrobeAPI
	var photos: [OutfitPhotoDTO]
	var error: String?
	weak var appModel: AppModel?
	init(api: any WardrobeAPI, photos: [OutfitPhotoDTO]) { self.api = api; self.photos = photos }
	func refresh(outfitId: ID) async {
		do { photos = try await api.outfit(id: outfitId).photos }
		catch { self.error = appModel?.message(for: error) }
	}
	func remove(_ photo: OutfitPhotoDTO, outfitId: ID) async {
		do {
			if photo.source == .immich { try await api.unlinkImmichAsset(outfitId: outfitId, linkId: photo.id) }
			else { try await api.deletePhoto(id: photo.id) }
			photos.removeAll { $0.id == photo.id }
		} catch { self.error = appModel?.message(for: error) }
	}
}

/// Gallery and photo actions for an outfit.
struct OutfitPhotosSection: View {
	let outfit: OutfitDetailDTO
	@Environment(AppModel.self) private var appModel
	@Environment(UploadQueue.self) private var uploads
	@State private var model: OutfitPhotosModel?
	@State private var selection: PhotosPickerItem?
	@State private var camera = false
	@State private var picker = false

	var body: some View {
		Section("Photos") {
			if let model {
				ScrollView(.horizontal) {
					HStack {
						ForEach(model.photos) { photo in
							VStack {
								OutfitImage(outfitId: outfit.id, photo: photo).frame(width: 180, height: 220).clipped()
								if outfit.access.canEdit {
									Button("Remove", role: .destructive) { Task { await model.remove(photo, outfitId: outfit.id) } }
								}
							}
						}
					}
				}
				if outfit.access.canEdit {
					PhotosPicker("Add from library", selection: $selection, matching: .images)
					if UIImagePickerController.isSourceTypeAvailable(.camera) {
						Button("Take photo") { camera = true }
					}
					if appModel.me?.features?.immich == true { Button("Add from Immich") { picker = true } }
				}
				if let error = model.error { Text(error).foregroundStyle(.red) }
			}
		}
		.task {
			if model == nil { let value = OutfitPhotosModel(api: appModel.api, photos: outfit.photos); value.appModel = appModel; model = value }
		}
		.onChange(of: uploads.jobs.filter { $0.target == .outfit(outfit.id) && $0.phase == .done }.count) { _, _ in
			Task { await model?.refresh(outfitId: outfit.id) }
		}
		.onChange(of: selection) { _, item in
			Task {
				do { if let data = try await item?.loadTransferable(type: Data.self) { enqueue(data) } }
				catch { model?.error = appModel.message(for: error) }
				selection = nil
			}
		}
		.sheet(isPresented: $camera) { CameraPickerView { data in enqueue(data) } }
		.sheet(isPresented: $picker) { ImmichPicker(outfitId: outfit.id) { photos in model?.photos.append(contentsOf: photos.filter { photo in !(model?.photos.contains { $0.id == photo.id } ?? false) }) } }
	}
	private func enqueue(_ data: Data) {
		do { try uploads.enqueue(imageData: data, kind: .outfit, target: .outfit(outfit.id), sessionId: nil) }
		catch { model?.error = appModel.message(for: error) }
	}
}

/// An uploaded or linked image, with a fallback when it is unavailable.
private struct OutfitImage: View {
	let outfitId: ID
	let photo: OutfitPhotoDTO
	@Environment(AppModel.self) private var appModel
	@State private var image: UIImage?
	var body: some View {
		ZStack {
			Rectangle().fill(.quaternary)
			if let image { Image(uiImage: image).resizable().scaledToFill() }
			else { Image(systemName: "photo.badge.exclamationmark").foregroundStyle(.secondary) }
		}.task(id: photo.id) {
			let data: Data?
			if photo.source == .immich { data = try? await appModel.images.outfitImmichImage(outfitId: outfitId, linkId: photo.id, variant: .display) }
			else { data = try? await appModel.images.data(photoId: photo.id, variant: .display) }
			if let data { image = UIImage(data: data) }
		}
	}
}
