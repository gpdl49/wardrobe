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
	@State private var showingCrop = false
	@State private var selectedPhotosPickerItem: PhotosPickerItem? = nil

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

				Section("Photo") {
					if let data = model.capturedPhotoData, let uiImage = UIImage(data: data) {
						VStack(alignment: .leading, spacing: 10) {
							HStack {
								Image(uiImage: uiImage)
									.resizable()
									.scaledToFit()
									.frame(maxHeight: 180)
									.clipShape(RoundedRectangle(cornerRadius: 8))

								Spacer()

								Button { showingCrop = true } label: { Label("Crop", systemImage: "crop") }
								.buttonStyle(.bordered)
								.controlSize(.small)

								Button(role: .destructive) {
									model.capturedPhotoData = nil
								} label: {
									Label("Remove", systemImage: "trash")
								}
								.buttonStyle(.bordered)
								.controlSize(.small)
							}

							Picker("Kind", selection: $model.photoKind) {
								Text("Main").tag(PhotoKind.main)
								Text("Label").tag(PhotoKind.label)
								Text("Detail").tag(PhotoKind.detail)
							}
							.pickerStyle(.segmented)
						}
						.padding(.vertical, 4)
					} else {
						HStack(spacing: 12) {
							if UIImagePickerController.isSourceTypeAvailable(.camera) {
								Button {
									model.showingCamera = true
								} label: {
									Label("Take photo", systemImage: "camera")
										.frame(maxWidth: .infinity)
								}
								.buttonStyle(.bordered)
							}

							Button {
								model.showingPhotosPicker = true
							} label: {
								Label("Choose photo", systemImage: "photo")
									.frame(maxWidth: .infinity)
							}
							.buttonStyle(.bordered)
						}
						.padding(.vertical, 4)
					}
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
					model.capturedPhotoData = data
				}
			}
			.fullScreenCover(isPresented: $showingCrop) {
				if let data = model.capturedPhotoData {
					PhotoCropView(data: data) { model.capturedPhotoData = $0 }
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
						model.capturedPhotoData = data
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
}

#Preview("New item") {
	NewItemView()
		.environment(AppModel.preview())
}
