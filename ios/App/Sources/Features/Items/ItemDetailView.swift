import PhotosUI
import SwiftUI
import WardrobeKit

/// One item: photos, fields, edit, analyses, history (WP5).
struct ItemDetailView: View {
	let itemId: ID

	@Environment(AppModel.self) private var appModel
	@Environment(UploadQueue.self) private var uploads
	@Environment(\.dismiss) private var dismiss
	@Environment(\.horizontalSizeClass) private var horizontalSizeClass

	@State private var viewModel: ItemDetailModel?
	@State private var selectedPhotosPickerItem: PhotosPickerItem? = nil

	var body: some View {
		Group {
			if let vm = viewModel {
				content(vm)
			} else {
				ProgressView()
			}
		}
		.task {
			if viewModel == nil {
				let vm = ItemDetailModel(itemId: itemId, api: appModel.api)
				vm.appModel = appModel
				viewModel = vm
				await vm.load()
			}
		}
		.onDisappear {
			viewModel?.stopPolling()
		}
	}

	@ViewBuilder
	private func content(_ vm: ItemDetailModel) -> some View {
		Group {
			if vm.isLoading && vm.item == nil {
				ProgressView("Loading item…")
			} else if let item = vm.item {
				mainView(item: item, vm: vm)
			} else if let error = vm.errorMessage {
				ContentUnavailableView {
					Label("Item unavailable", systemImage: "tshirt")
				} description: {
					Text(error)
				} actions: {
					Button("Try again") {
						Task { await vm.load() }
					}
				}
			}
		}
		.navigationTitle(vm.item?.name ?? "Item")
		.navigationBarTitleDisplayMode(.inline)
		.toolbar {
			if let item = vm.item, item.access.canEdit {
				ToolbarItem(placement: .primaryAction) {
					Button {
						vm.isEditing = true
					} label: {
						Label("Edit", systemImage: "pencil")
					}
					.keyboardShortcut("e", modifiers: .command)
				}

				ToolbarItem(placement: .destructiveAction) {
					Button(role: .destructive) {
						vm.isShowingDeleteAlert = true
					} label: {
						Label("Delete", systemImage: "trash")
					}
				}
			}
		}
		.confirmationDialog(
			"Delete \(vm.item?.name ?? "item")?",
			isPresented: Binding(get: { vm.isShowingDeleteAlert }, set: { vm.isShowingDeleteAlert = $0 }),
			titleVisibility: .visible
		) {
			Button("Delete", role: .destructive) {
				Task {
					if await vm.deleteItem() {
						dismiss()
					}
				}
			}
			Button("Cancel", role: .cancel) {}
		} message: {
			Text("The item, its photos and its history are deleted. This cannot be undone.")
		}
		.confirmationDialog(
			"Delete photo?",
			isPresented: Binding(
				get: { vm.photoToDelete != nil },
				set: { if !$0 { vm.photoToDelete = nil } }
			),
			titleVisibility: .visible
		) {
			Button("Delete photo", role: .destructive) {
				if let photo = vm.photoToDelete {
					Task { await vm.deletePhoto(photoId: photo.id) }
				}
				vm.photoToDelete = nil
			}
			Button("Cancel", role: .cancel) {
				vm.photoToDelete = nil
			}
		} message: {
			Text("This photo will be permanently removed.")
		}
		.sheet(isPresented: Binding(get: { vm.isEditing }, set: { vm.isEditing = $0 })) {
			if let item = vm.item {
				ItemEditView(item: item, api: appModel.api) { updated in
					vm.item = updated
				}
			}
		}
		.sheet(isPresented: Binding(get: { vm.showingCamera }, set: { vm.showingCamera = $0 })) {
			CameraPickerView { data in
				vm.handleImagePicked(data)
			}
		}
		.photosPicker(
			isPresented: Binding(get: { vm.showingPhotosPicker }, set: { vm.showingPhotosPicker = $0 }),
			selection: $selectedPhotosPickerItem,
			matching: .images
		)
		.onChange(of: selectedPhotosPickerItem) { _, newItem in
			guard let newItem else { return }
			Task {
				if let data = try? await newItem.loadTransferable(type: Data.self) {
					vm.handleImagePicked(data)
				}
				selectedPhotosPickerItem = nil
			}
		}
		.sheet(isPresented: Binding(get: { vm.showingKindSelection }, set: { vm.showingKindSelection = $0 })) {
			NavigationStack {
				Form {
					Section("Photo kind") {
						Picker("Kind", selection: Binding(get: { vm.selectedKind }, set: { vm.selectedKind = $0 })) {
							Text("Main").tag(PhotoKind.main)
							Text("Label").tag(PhotoKind.label)
							Text("Detail").tag(PhotoKind.detail)
						}
						.pickerStyle(.inline)
					}
				}
				.navigationTitle("Upload photo")
				.navigationBarTitleDisplayMode(.inline)
				.toolbar {
					ToolbarItem(placement: .cancellationAction) {
						Button("Cancel") {
							vm.pendingPhotoData = nil
							vm.showingKindSelection = false
						}
					}
					ToolbarItem(placement: .confirmationAction) {
						Button("Upload") {
							vm.confirmPhotoUpload(uploads: uploads)
						}
					}
				}
			}
			.presentationDetents([.medium])
		}
		.errorAlert(Binding(get: { vm.errorMessage }, set: { vm.errorMessage = $0 }))
		.errorAlert(Binding(get: { vm.deleteError }, set: { vm.deleteError = $0 }))
	}

	@ViewBuilder
	private func mainView(item: ItemDetailDTO, vm: ItemDetailModel) -> some View {
		if horizontalSizeClass == .regular {
			// iPad 2-column layout
			HStack(alignment: .top, spacing: 24) {
				ScrollView {
					photosCarousel(item: item, vm: vm)
						.padding()
				}
				.frame(maxWidth: 450)

				ScrollView {
					VStack(alignment: .leading, spacing: 20) {
						fieldsView(item: item, vm: vm)
						suggestionsView(item: item, vm: vm)
						movementsView(item: item)
					}
					.padding()
				}
			}
		} else {
			// iPhone 1-column layout
			ScrollView {
				VStack(alignment: .leading, spacing: 20) {
					photosCarousel(item: item, vm: vm)
					fieldsView(item: item, vm: vm)
					suggestionsView(item: item, vm: vm)
					movementsView(item: item)
				}
				.padding()
			}
		}
	}

	@ViewBuilder
	private func photosCarousel(item: ItemDetailDTO, vm: ItemDetailModel) -> some View {
		VStack(spacing: 8) {
			if vm.sortedPhotos.isEmpty {
				VStack(spacing: 12) {
					Image(systemName: "tshirt")
						.font(.system(size: 48))
						.foregroundStyle(.tertiary)
					Text("No photos yet")
						.font(.subheadline)
						.foregroundStyle(.secondary)
				}
				.frame(maxWidth: .infinity)
				.aspectRatio(4/5, contentMode: .fit)
				.background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
			} else {
				ZStack(alignment: .bottomTrailing) {
					TabView(selection: Binding(get: { vm.selectedPhotoIndex }, set: { vm.selectedPhotoIndex = $0 })) {
						ForEach(Array(vm.sortedPhotos.enumerated()), id: \.element.id) { index, photo in
							ZStack(alignment: .topLeading) {
								RemotePhotoView(photo: photo, variant: .display, contentMode: .fit)
									.frame(maxWidth: .infinity, maxHeight: .infinity)

								// Status overlay
								if photo.status != .ready {
									HStack(spacing: 4) {
										if photo.status == .failed {
											Image(systemName: "exclamationmark.triangle")
											Text("Processing failed")
										} else {
											ProgressView().controlSize(.mini)
											Text("Processing…")
										}
									}
									.font(.caption2.bold())
									.padding(.horizontal, 8)
									.padding(.vertical, 4)
									.background(.black.opacity(0.7), in: Capsule())
									.foregroundStyle(.white)
									.padding(8)
								}

								// Top-right controls: cover badge & photo actions
								HStack {
									Spacer()

									if photo.id == item.coverPhoto?.id {
										Label("Cover", systemImage: "star.fill")
											.font(.caption2.bold())
											.padding(.horizontal, 8)
											.padding(.vertical, 4)
											.background(.black.opacity(0.6), in: Capsule())
											.foregroundStyle(.yellow)
									} else if vm.canEdit {
										Button {
											Task { await vm.setCoverPhoto(photoId: photo.id) }
										} label: {
											Label("Make cover", systemImage: "star")
												.font(.caption2.bold())
												.padding(.horizontal, 8)
												.padding(.vertical, 4)
												.background(.black.opacity(0.6), in: Capsule())
												.foregroundStyle(.white)
										}
									}

									if vm.canEdit {
										Menu {
											Section("Photo kind") {
												Button("Main") {
													Task { await vm.changePhotoKind(photoId: photo.id, kind: .main) }
												}
												Button("Label") {
													Task { await vm.changePhotoKind(photoId: photo.id, kind: .label) }
												}
												Button("Detail") {
													Task { await vm.changePhotoKind(photoId: photo.id, kind: .detail) }
												}
											}

											Divider()

											Button(role: .destructive) {
												vm.photoToDelete = photo
											} label: {
												Label("Delete photo", systemImage: "trash")
											}
										} label: {
											Image(systemName: "ellipsis.circle.fill")
												.font(.title3)
												.foregroundStyle(.white)
												.shadow(radius: 2)
										}
										.accessibilityLabel("Photo options")
									}
								}
								.padding(8)
							}
							.tag(index)
						}
					}
					.tabViewStyle(.page(indexDisplayMode: .always))
					.aspectRatio(4/5, contentMode: .fit)
					.background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
					.clipShape(RoundedRectangle(cornerRadius: 12))
				}
			}

			// Add photo buttons
			if vm.canEdit {
				HStack(spacing: 12) {
					if UIImagePickerController.isSourceTypeAvailable(.camera) {
						Button {
							vm.showingCamera = true
						} label: {
							Label("Take photo", systemImage: "camera")
								.font(.subheadline)
						}
						.buttonStyle(.bordered)
					}

					Button {
						vm.showingPhotosPicker = true
					} label: {
						Label("Add from library", systemImage: "photo.badge.plus")
							.font(.subheadline)
					}
					.buttonStyle(.bordered)
				}
				.padding(.top, 4)
			}
		}
	}

	@ViewBuilder
	private func fieldsView(item: ItemDetailDTO, vm: ItemDetailModel) -> some View {
		VStack(alignment: .leading, spacing: 14) {
			// Title
			Text(item.name ?? "Untitled Item")
				.opacity(item.nameGenerated == true ? 0.6 : 1)
				.font(.title2.bold())

			// Location link
			if let loc = item.location {
				NavigationLink(value: Route.location(loc.id)) {
					HStack(spacing: 6) {
						Image(systemName: loc.kind.symbolName)
						Text(loc.name.isEmpty ? loc.code : "\(loc.code) — \(loc.name)")
							.font(.subheadline.bold())
					}
					.foregroundStyle(Color.accentColor)
				}
			}

			// Details list
			VStack(spacing: 8) {
				detailRow("Status") {
					Text(item.status.label)
						.font(.caption.bold())
						.padding(.horizontal, 8)
						.padding(.vertical, 3)
						.background(statusColor(item.status).opacity(0.15), in: Capsule())
						.foregroundStyle(statusColor(item.status))
				}

				if let cat = item.category {
					detailRow("Category") {
						Text(CategoryTreeHelper.path(for: cat.id, in: vm.categories) ?? cat.name)
					}
				}

				if let brand = item.brand, !brand.isEmpty {
					detailRow("Brand") { Text(brand) }
				}

				if let size = item.size, !size.isEmpty {
					detailRow("Size") { Text(size) }
				}

				if !item.colors.isEmpty {
					detailRow("Colours") {
						HStack(spacing: 6) {
							ForEach(item.colors, id: \.hex) { c in
								Circle()
									.fill(Color(hex: c.hex))
									.frame(width: 14, height: 14)
									.overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 0.5))
							}
							Text(item.colors.map(\.name).joined(separator: ", "))
						}
					}
				}

				if let pattern = item.pattern, !pattern.isEmpty {
					detailRow("Pattern") { Text(pattern) }
				}

				if let material = item.material, !material.isEmpty {
					detailRow("Material") { Text(material) }
				}

				if !item.seasons.isEmpty {
					detailRow("Seasons") {
						HStack(spacing: 6) {
							ForEach(item.seasons, id: \.rawValue) { season in
								Label(season.label, systemImage: season.symbolName)
									.font(.caption)
									.padding(.horizontal, 6)
									.padding(.vertical, 2)
									.background(Color.secondary.opacity(0.12), in: Capsule())
							}
						}
					}
				}

				if !item.tags.isEmpty {
					detailRow("Tags") {
						FlowLayout(spacing: 4) {
							ForEach(item.tags, id: \.self) { tag in
								Text("#\(tag)")
									.font(.caption)
									.padding(.horizontal, 8)
									.padding(.vertical, 3)
									.background(Color.accentColor.opacity(0.12), in: Capsule())
									.foregroundStyle(Color.accentColor)
							}
						}
					}
				}

				if let notes = item.notes, !notes.isEmpty {
					detailRow("Notes") {
						Text(notes)
							.font(.subheadline)
					}
				}

				detailRow("Added") {
					Text(item.createdAt.formatted(date: .abbreviated, time: .omitted))
						.font(.caption)
						.foregroundStyle(.secondary)
				}
			}
		}
		.padding()
		.background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
	}

	@ViewBuilder
	private func suggestionsView(item: ItemDetailDTO, vm: ItemDetailModel) -> some View {
		ItemSuggestionsView(
			item: item,
			categories: vm.categories,
			canEdit: vm.canEdit,
			isRerunning: vm.isRerunningAnalyses,
			message: vm.analysisMessage,
			pendingFields: vm.pendingSuggestionFields,
			onRerun: {
				Task { await vm.rerunAnalyses() }
			},
			onAcceptField: { analysis, field in
				Task { await vm.applySuggestion(analysisId: analysis.id, fields: [field]) }
			},
			onAcceptAll: { analysis, fields in
				Task { await vm.applySuggestion(analysisId: analysis.id, fields: fields) }
			}
		)
	}

	@ViewBuilder
	private func movementsView(item: ItemDetailDTO) -> some View {
		VStack(alignment: .leading, spacing: 12) {
			Label("History", systemImage: "clock.arrow.circlepath")
				.font(.headline)

			let movements = item.movements.sorted { $0.at > $1.at }
			if movements.isEmpty {
				Text("Never moved.")
					.font(.subheadline)
					.foregroundStyle(.secondary)
					.padding(.vertical, 4)
			} else {
				VStack(spacing: 8) {
					ForEach(movements) { m in
						HStack(spacing: 8) {
							locationLink(m.from, defaultText: "nowhere")
							Image(systemName: "arrow.right")
								.font(.caption2)
								.foregroundStyle(.tertiary)
							locationLink(m.to, defaultText: "nowhere")

							if m.sessionId != nil {
								Text("packing")
									.font(.caption2.bold())
									.padding(.horizontal, 6)
									.padding(.vertical, 2)
									.background(Color.secondary.opacity(0.12), in: Capsule())
							}

							Spacer()

							Text(m.at.formatted(date: .abbreviated, time: .shortened))
								.font(.caption2)
								.foregroundStyle(.secondary)
						}
						.font(.subheadline)
						.padding(.vertical, 4)
					}
				}
			}
		}
		.padding()
		.background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
	}

	@ViewBuilder
	private func locationLink(_ loc: LocationRef?, defaultText: String) -> some View {
		if let loc {
			NavigationLink(value: Route.location(loc.id)) {
				Text(loc.code)
					.font(.subheadline.bold())
					.foregroundStyle(Color.accentColor)
			}
		} else {
			Text(defaultText)
				.foregroundStyle(.secondary)
		}
	}

	@ViewBuilder
	private func detailRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
		HStack(alignment: .top, spacing: 12) {
			Text(label)
				.font(.subheadline)
				.foregroundStyle(.secondary)
				.frame(width: 80, alignment: .leading)

			content()
				.frame(maxWidth: .infinity, alignment: .leading)
		}
		.padding(.vertical, 2)
	}

	private func statusColor(_ status: ItemStatus) -> Color {
		switch status {
		case .active: return .green
		case .stored: return .blue
		case .lent: return .orange
		case .donated, .discarded: return .gray
		default: return .primary
		}
	}
}

#Preview("Item detail") {
	NavigationStack {
		ItemDetailView(itemId: "30000000-0000-4000-8000-000000000001")
	}
	.environment(AppModel.preview())
}
