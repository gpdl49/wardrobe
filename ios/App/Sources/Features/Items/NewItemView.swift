import PhotosUI
import SwiftUI
import WardrobeKit

/// Sheet: create an item (optionally in a location / another owner's
/// wardrobe) with photos (WP5). Calls `onCreated` with the new item's id.
struct NewItemView: View {
	var locationId: ID? = nil
	var ownerId: ID? = nil
	var onCreated: (ID) -> Void = { _ in }

	@Environment(AppModel.self) private var appModel
	@Environment(UploadQueue.self) private var uploads
	@Environment(\.dismiss) private var dismiss

	@State private var model: NewItemModel
	@State private var selectedPhotosPickerItem: PhotosPickerItem? = nil
	/// The slot a photo is being taken or chosen for.
	@State private var pickingSlot: PhotoSlot? = nil
	@State private var showingSourceDialog = false
	@State private var croppingSlot: PhotoSlot? = nil
	@State private var thumbnails: [PhotoSlot: UIImage] = [:]

	private static let tileSize: CGFloat = 84
	private let cameraAvailable = UIImagePickerController.isSourceTypeAvailable(.camera)

	init(locationId: ID? = nil, ownerId: ID? = nil, onCreated: @escaping (ID) -> Void = { _ in }) {
		self.locationId = locationId
		self.ownerId = ownerId
		self.onCreated = onCreated
		_model = State(initialValue: NewItemModel(locationId: locationId, ownerId: ownerId))
	}

	var body: some View {
		NavigationStack {
			Form {
				Section("Item info") {
					TextField("Name (e.g. Navy cardigan)", text: $model.name)

					CategoryPickerView(selection: $model.categoryId, categories: model.categories)

					Picker("Location", selection: $model.locationId) {
						Text("No location").tag(ID?.none)
						ForEach(model.locations) { loc in
							Label(loc.name.isEmpty ? loc.code : "\(loc.code) — \(loc.name)", systemImage: loc.kind.symbolName)
								.tag(ID?.some(loc.id))
						}
					}

					TextField("Notes", text: $model.notes, axis: .vertical)
						.lineLimit(2...5)
				}

				Section {
					ScrollView(.horizontal, showsIndicators: false) {
						HStack(alignment: .top, spacing: 12) {
							ForEach(model.slots) { slot in
								slotTile(slot)
							}
							addDetailTile
						}
						.padding(.vertical, 4)
					}
				} header: {
					Text("Photos")
				} footer: {
					Text("The front becomes the cover. Add the back, the label and any close-ups.")
				}
			}
			.navigationTitle("New item")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") {
						dismiss()
					}
				}
				ToolbarItem(placement: .confirmationAction) {
					Button(model.hasPhoto ? "Create item" : "Create without photo") {
						Task {
							if let createdId = await model.create(api: appModel.api, uploads: uploads) {
								onCreated(createdId)
								dismiss()
							} else if model.errorMessage == nil {
								// Job enqueued with photo, dismiss
								dismiss()
							}
						}
					}
					.disabled(model.isCreating)
				}
			}
			.sheet(isPresented: $model.showingCamera) {
				CameraPickerView { data in
					store(data)
				}
			}
			.fullScreenCover(item: $croppingSlot) { slot in
				if let data = model.photos[slot] {
					PhotoCropView(data: data) { store($0, in: slot) }
				}
			}
			.photosPicker(
				isPresented: $model.showingPhotosPicker,
				selection: $selectedPhotosPickerItem,
				matching: .images
			)
			.onChange(of: selectedPhotosPickerItem) { _, newItem in
				guard let newItem else { return }
				Task {
					if let data = try? await newItem.loadTransferable(type: Data.self) {
						store(data)
					}
					selectedPhotosPickerItem = nil
				}
			}
			.task {
				model.appModel = appModel
				await model.loadData(api: appModel.api)
			}
			.errorAlert($model.errorMessage)
		}
	}

	// MARK: - Photo slots

	@ViewBuilder
	private func slotTile(_ slot: PhotoSlot) -> some View {
		sourceDialog(on: slotTileContent(slot), presented: pickingSlot == slot)
	}

	@ViewBuilder
	private func slotTileContent(_ slot: PhotoSlot) -> some View {
		VStack(spacing: 6) {
			if let thumbnail = thumbnails[slot] {
				Menu {
					Button { croppingSlot = slot } label: { Label("Crop", systemImage: "crop") }
					Button { choose(slot) } label: { Label("Replace", systemImage: "arrow.triangle.2.circlepath.camera") }
					Button(role: .destructive) { remove(slot) } label: { Label("Remove", systemImage: "trash") }
				} label: {
					Image(uiImage: thumbnail)
						.resizable()
						.scaledToFill()
						.frame(width: Self.tileSize, height: Self.tileSize)
						.clipShape(RoundedRectangle(cornerRadius: 10))
				}
				.accessibilityLabel("\(slot.title) photo")
			} else {
				Button { choose(slot) } label: {
					emptyTile(systemImage: "plus")
				}
				.buttonStyle(.plain)
				.accessibilityLabel("Add \(slot.title.lowercased()) photo")
			}
			Text(slot.title)
				.font(.caption)
				.foregroundStyle(.secondary)
		}
	}

	private var addDetailTile: some View {
		let addingDetail = pickingSlot.map { !model.slots.contains($0) } ?? false
		return sourceDialog(on: addDetailTileContent, presented: addingDetail)
	}

	private var addDetailTileContent: some View {
		VStack(spacing: 6) {
			Button { choose(.detail(UUID())) } label: {
				emptyTile(systemImage: "plus.viewfinder")
			}
			.buttonStyle(.plain)
			.accessibilityLabel("Add detail photo")
			Text("Add detail")
				.font(.caption)
				.foregroundStyle(.secondary)
		}
	}

	/// The camera-or-library choice on the tile that asked for it, so its
	/// popover points at that tile.
	private func sourceDialog(on tile: some View, presented: Bool) -> some View {
		tile.confirmationDialog(
			"Add \(pickingSlot?.title.lowercased() ?? "") photo",
			isPresented: Binding(
				get: { showingSourceDialog && presented },
				set: { showingSourceDialog = $0 }
			),
			titleVisibility: .visible
		) {
			Button("Take photo") { model.showingCamera = true }
			Button("Choose from library") { model.showingPhotosPicker = true }
		}
	}

	private func emptyTile(systemImage: String) -> some View {
		RoundedRectangle(cornerRadius: 10)
			.strokeBorder(.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
			.background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
			.frame(width: Self.tileSize, height: Self.tileSize)
			.overlay {
				Image(systemName: systemImage)
					.font(.title2)
					.foregroundStyle(.secondary)
			}
			.contentShape(RoundedRectangle(cornerRadius: 10))
	}

	/// Starts taking or choosing a photo for `slot`.
	private func choose(_ slot: PhotoSlot) {
		pickingSlot = slot
		if cameraAvailable {
			showingSourceDialog = true
		} else {
			model.showingPhotosPicker = true
		}
	}

	/// Puts a new photo in the slot being picked (or `slot`).
	private func store(_ data: Data, in slot: PhotoSlot? = nil) {
		guard let slot = slot ?? pickingSlot else { return }
		model.setPhoto(data, for: slot)
		thumbnails[slot] = Self.thumbnail(of: data)
		if slot == pickingSlot { pickingSlot = nil }
	}

	private func remove(_ slot: PhotoSlot) {
		model.removePhoto(slot)
		thumbnails[slot] = nil
	}

	/// A small decoded copy, so tiles don't redraw full-size photos.
	private static func thumbnail(of data: Data) -> UIImage? {
		guard let image = UIImage(data: data) else { return nil }
		let side = tileSize * 3
		let scale = side / max(1, min(image.size.width, image.size.height))
		guard scale < 1 else { return image }
		let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
		return image.preparingThumbnail(of: size) ?? image
	}

}

#Preview("New item") {
	NewItemView()
		.environment(AppModel.preview())
}
