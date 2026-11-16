import SwiftUI
import WardrobeKit

/// One location: contents, children, edit, QR label, move items (WP6).
public struct LocationDetailView: View {
	@Environment(AppModel.self) private var model
	@Environment(\.dismiss) private var dismiss
	@Environment(\.horizontalSizeClass) private var horizontalSizeClass

	public let locationId: ID

	@State private var detailModel: LocationDetailModel?
	@State private var viewMode: ViewMode = .grid

	// Sheets & Dialogs
	@State private var showingEditSheet = false
	@State private var showingAddChildSheet = false
	@State private var showingAddItemSheet = false
	@State private var showingLabelSheet = false
	@State private var showingMoveSheet = false
	@State private var moveItemIds: [ID] = []
	@State private var showingDeleteConfirmation = false

	private enum ViewMode: String, CaseIterable {
		case grid, list
	}

	public init(locationId: ID) {
		self.locationId = locationId
	}

	public var body: some View {
		Group {
			if let detailModel {
				if detailModel.isLoading && detailModel.detail == nil {
					ProgressView("Loading location…")
						.frame(maxWidth: .infinity, maxHeight: .infinity)
				} else if let detail = detailModel.detail {
					contentView(detail: detail, detailModel: detailModel)
				} else if let error = detailModel.errorMessage {
					ContentUnavailableView {
						Label("Location Unavailable", systemImage: "shippingbox")
					} description: {
						Text(error)
					} actions: {
						Button("Try Again") {
							Task { await detailModel.load() }
						}
					}
				}
			} else {
				ProgressView()
			}
		}
		.navigationTitle(detailModel?.detail?.code ?? "Location")
		.navigationBarTitleDisplayMode(.inline)
		.toolbar {
			toolbarContent
		}
		.errorAlert(Binding(
			get: { detailModel?.errorMessage },
			set: { detailModel?.errorMessage = $0 }
		))
		.confirmationDialog(
			"Delete \(detailModel?.detail?.code ?? "Location")?",
			isPresented: $showingDeleteConfirmation,
			titleVisibility: .visible
		) {
			Button("Delete Location", role: .destructive) {
				Task {
					do {
						try await detailModel?.delete()
						dismiss()
					} catch {
						// Error handled by detailModel.errorMessage
					}
				}
			}
			Button("Cancel", role: .cancel) {}
		} message: {
			Text("The location is deleted. Its QR label will stop working.")
		}
		.sheet(isPresented: $showingEditSheet) {
			if let loc = detailModel?.detail?.location {
				LocationFormView(
					location: loc,
					ownerId: loc.ownerId,
					defaultParentId: loc.parentId,
					lockParent: false,
					onSaved: { _ in
						Task { await detailModel?.load() }
					}
				)
			}
		}
		.sheet(isPresented: $showingAddChildSheet) {
			if let detail = detailModel?.detail {
				LocationFormView(
					location: nil,
					ownerId: detail.ownerId,
					defaultParentId: detail.id,
					lockParent: false,
					onSaved: { _ in
						Task { await detailModel?.load() }
					}
				)
			}
		}
		.sheet(isPresented: $showingAddItemSheet) {
			if let detail = detailModel?.detail {
				NewItemView(
					locationId: detail.id,
					ownerId: detail.ownerId,
					onCreated: { _ in
						Task { await detailModel?.load() }
					}
				)
			}
		}
		.sheet(isPresented: $showingLabelSheet) {
			if let loc = detailModel?.detail?.location {
				LocationLabelSheet(location: loc, baseURL: model.config.baseURL)
			}
		}
		.sheet(isPresented: $showingMoveSheet) {
			if let detail = detailModel?.detail {
				LocationMoveSheet(
					itemIds: moveItemIds,
					ownerId: detail.ownerId,
					currentLocationId: detail.id,
					onMove: { targetId in
						await detailModel?.moveItems(itemIds: moveItemIds, toLocationId: targetId)
					}
				)
			}
		}
		.task(id: locationId) {
			let dModel = LocationDetailModel(api: model.api, locationId: locationId)
			dModel.appModel = model
			self.detailModel = dModel
			await dModel.load()
		}
		.refreshable {
			await detailModel?.load()
		}
	}

	// MARK: - Main Layout

	@ViewBuilder
	private func contentView(detail: LocationDetailDTO, detailModel: LocationDetailModel) -> some View {
		if horizontalSizeClass == .regular {
			// iPad two-column layout
			HStack(alignment: .top, spacing: 24) {
				ScrollView {
					VStack(alignment: .leading, spacing: 24) {
						headerView(detail: detail, parent: detailModel.parentLocation)
						actionsSection(detail: detail, detailModel: detailModel)
						if !detail.children.isEmpty {
							childrenSection(children: detail.children)
						}
					}
					.padding()
				}
				.frame(minWidth: 320, maxWidth: 400)

				Divider()

				ScrollView {
					itemsSection(items: detail.items, detailModel: detailModel)
						.padding()
				}
				.frame(maxWidth: .infinity)
			}
		} else {
			// iPhone single-column scrolling layout
			ScrollView {
				VStack(alignment: .leading, spacing: 24) {
					headerView(detail: detail, parent: detailModel.parentLocation)
					actionsSection(detail: detail, detailModel: detailModel)
					if !detail.children.isEmpty {
						childrenSection(children: detail.children)
					}
					itemsSection(items: detail.items, detailModel: detailModel)
				}
				.padding()
			}
		}
	}

	// MARK: - Header

	private func headerView(detail: LocationDetailDTO, parent: LocationDTO?) -> some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack(spacing: 8) {
				Label(detail.kind.label, systemImage: detail.kind.symbolName)
					.font(.subheadline.weight(.medium))
					.foregroundStyle(.secondary)

				if let parent {
					Text("in")
						.font(.subheadline)
						.foregroundStyle(.tertiary)
					NavigationLink(value: Route.location(parent.id)) {
						Text(parent.name.isEmpty ? parent.code : parent.name)
							.font(.subheadline.weight(.semibold))
							.foregroundStyle(.tint)
					}
				}

				if detail.archivedAt != nil {
					Text("Archived")
						.font(.caption2.weight(.bold))
						.padding(.horizontal, 8)
						.padding(.vertical, 3)
						.background(Color.secondary.opacity(0.15))
						.clipShape(Capsule())
				}
			}

			Text(detail.code)
				.font(.system(.largeTitle, design: .monospaced, weight: .bold))

			if detail.name != detail.code {
				Text(detail.name)
					.font(.title3)
					.foregroundStyle(.secondary)
			}

			if let notes = detail.notes, !notes.isEmpty {
				Text(notes)
					.font(.body)
					.foregroundStyle(.secondary)
					.padding(.top, 4)
			}
		}
	}

	// MARK: - Actions Row

	private func actionsSection(detail: LocationDetailDTO, detailModel: LocationDetailModel) -> some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 10) {
				Button {
					showingLabelSheet = true
				} label: {
					Label("QR Label", systemImage: "qrcode")
				}
				.buttonStyle(.bordered)

				if detailModel.canEdit {
					Button {
						showingAddItemSheet = true
					} label: {
						Label("Add Item", systemImage: "plus")
					}
					.buttonStyle(.bordered)

					Button {
						showingAddChildSheet = true
					} label: {
						Label("Add Inside", systemImage: "shippingbox")
					}
					.buttonStyle(.bordered)

					Button {
						showingEditSheet = true
					} label: {
						Label("Edit", systemImage: "pencil")
					}
					.buttonStyle(.bordered)

					if detail.items.count > 0 {
						Button {
							moveItemIds = detail.items.map(\.id)
							showingMoveSheet = true
						} label: {
							Label("Move All", systemImage: "arrow.right.arrow.left")
						}
						.buttonStyle(.bordered)
					}

					Menu {
						if detail.archivedAt == nil {
							Button {
								Task { await detailModel.archive() }
							} label: {
								Label("Archive Location", systemImage: "archivebox")
							}
						} else {
							Button {
								Task { await detailModel.restore() }
							} label: {
								Label("Restore Location", systemImage: "arrow.counterclockwise")
							}
						}

						Button(role: .destructive) {
							showingDeleteConfirmation = true
						} label: {
							Label("Delete Location", systemImage: "trash")
						}
					} label: {
						Image(systemName: "ellipsis.circle")
							.imageScale(.large)
							.padding(8)
					}
				}
			}
		}
	}

	// MARK: - Children (Inside)

	private func childrenSection(children: [LocationDTO]) -> some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Inside (\(children.count))")
				.font(.headline)

			LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
				ForEach(children) { child in
					NavigationLink(value: Route.location(child.id)) {
						HStack(spacing: 12) {
							Image(systemName: child.kind.symbolName)
								.foregroundStyle(.secondary)
							VStack(alignment: .leading, spacing: 2) {
								Text(child.code)
									.font(.subheadline.monospaced().weight(.semibold))
									.foregroundStyle(.primary)
								Text(child.name)
									.font(.caption)
									.foregroundStyle(.secondary)
									.lineLimit(1)
							}
							Spacer()
							Text("\(child.itemCount)")
								.font(.caption.monospacedDigit())
								.foregroundStyle(.secondary)
						}
						.padding(12)
						.background(Color(.secondarySystemBackground))
						.clipShape(RoundedRectangle(cornerRadius: 12))
					}
				}
			}
		}
	}

	// MARK: - Items (Contents)

	private func itemsSection(items: [ItemSummaryDTO], detailModel: LocationDetailModel) -> some View {
		VStack(alignment: .leading, spacing: 16) {
			HStack {
				Text("Contents (\(items.count))")
					.font(.headline)

				Spacer()

				if detailModel.canEdit && !items.isEmpty {
					Button(detailModel.isSelectingItems ? "Done" : "Select") {
						withAnimation {
							detailModel.isSelectingItems.toggle()
							if !detailModel.isSelectingItems {
								detailModel.selectedItemIds.removeAll()
							}
						}
					}
					.font(.subheadline)
				}

				Picker("View Mode", selection: $viewMode) {
					Image(systemName: "square.grid.2x2").tag(ViewMode.grid)
					Image(systemName: "list.bullet").tag(ViewMode.list)
				}
				.pickerStyle(.segmented)
				.frame(width: 100)
			}

			if detailModel.isSelectingItems && !detailModel.selectedItemIds.isEmpty {
				HStack {
					Text("\(detailModel.selectedItemIds.count) selected")
						.font(.subheadline)
						.foregroundStyle(.secondary)
					Spacer()
					Button("Move to…") {
						moveItemIds = Array(detailModel.selectedItemIds)
						showingMoveSheet = true
					}
					.buttonStyle(.borderedProminent)
					.controlSize(.small)
				}
				.padding(.horizontal, 4)
			}

			if items.isEmpty {
				ContentUnavailableView {
					Label("Empty Location", systemImage: "shippingbox")
				} description: {
					Text("Nothing is currently placed inside \(detailModel.detail?.code ?? "this location").")
				}
				.frame(maxWidth: .infinity, minHeight: 200)
			} else if viewMode == .grid {
				LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 16)], spacing: 16) {
					ForEach(items) { item in
						itemGridCell(item: item, detailModel: detailModel)
					}
				}
			} else {
				LazyVStack(spacing: 8) {
					ForEach(items) { item in
						itemListRow(item: item, detailModel: detailModel)
					}
				}
			}
		}
	}

	// MARK: - Item Grid Cell

	private func itemGridCell(item: ItemSummaryDTO, detailModel: LocationDetailModel) -> some View {
		let isSelected = detailModel.selectedItemIds.contains(item.id)

		return Button {
			if detailModel.isSelectingItems {
				toggleSelection(for: item.id, detailModel: detailModel)
			} else {
				model.router.open(.item(item.id))
			}
		} label: {
			VStack(alignment: .leading, spacing: 8) {
				ZStack(alignment: .topTrailing) {
					RemotePhotoView(photo: item.coverPhoto, variant: .thumb, contentMode: .fill)
						.frame(minHeight: 140, maxHeight: 160)
						.clipShape(RoundedRectangle(cornerRadius: 12))

					if detailModel.isSelectingItems {
						if isSelected {
							Image(systemName: "checkmark.circle.fill")
								.font(.title2)
								.foregroundStyle(.tint)
								.background(Circle().fill(.white))
								.padding(8)
						} else {
							Image(systemName: "circle")
								.font(.title2)
								.foregroundStyle(.white)
								.background(Circle().fill(.black.opacity(0.3)))
								.padding(8)
						}
					}
				}

				VStack(alignment: .leading, spacing: 2) {
					Text(item.name ?? item.brand ?? "Item").opacity(item.nameGenerated == true ? 0.6 : 1)
						.font(.subheadline.weight(.medium))
						.foregroundStyle(.primary)
						.lineLimit(1)

					if let brand = item.brand, item.name != nil {
						Text(brand)
							.font(.caption)
							.foregroundStyle(.secondary)
							.lineLimit(1)
					}
				}
			}
		}
		.buttonStyle(.plain)
	}

	// MARK: - Item List Row

	private func itemListRow(item: ItemSummaryDTO, detailModel: LocationDetailModel) -> some View {
		let isSelected = detailModel.selectedItemIds.contains(item.id)

		return Button {
			if detailModel.isSelectingItems {
				toggleSelection(for: item.id, detailModel: detailModel)
			} else {
				model.router.open(.item(item.id))
			}
		} label: {
			HStack(spacing: 12) {
				if detailModel.isSelectingItems {
					if isSelected {
						Image(systemName: "checkmark.circle.fill")
							.font(.title3)
							.foregroundStyle(.tint)
					} else {
						Image(systemName: "circle")
							.font(.title3)
							.foregroundStyle(.secondary)
					}
				}

				RemotePhotoView(photo: item.coverPhoto, variant: .thumb, contentMode: .fill)
					.frame(width: 48, height: 48)
					.clipShape(RoundedRectangle(cornerRadius: 8))

				VStack(alignment: .leading, spacing: 2) {
					Text(item.name ?? item.brand ?? "Item").opacity(item.nameGenerated == true ? 0.6 : 1)
						.font(.subheadline.weight(.medium))
						.foregroundStyle(.primary)
						.lineLimit(1)

					HStack(spacing: 6) {
						if let brand = item.brand {
							Text(brand).font(.caption).foregroundStyle(.secondary)
						}
						if let size = item.size {
							Text("• \(size)").font(.caption).foregroundStyle(.secondary)
						}
						if let cat = item.category?.name {
							Text("• \(cat)").font(.caption).foregroundStyle(.secondary)
						}
					}
				}

				Spacer()

				if !detailModel.isSelectingItems {
					Image(systemName: "chevron.right")
						.font(.caption)
						.foregroundStyle(.tertiary)
				}
			}
			.padding(10)
			.background(Color(.secondarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 10))
		}
		.buttonStyle(.plain)
	}

	private func toggleSelection(for id: ID, detailModel: LocationDetailModel) {
		if detailModel.selectedItemIds.contains(id) {
			detailModel.selectedItemIds.remove(id)
		} else {
			detailModel.selectedItemIds.insert(id)
		}
	}

	// MARK: - Toolbar

	@ToolbarContentBuilder
	private var toolbarContent: some ToolbarContent {
		ToolbarItem(placement: .topBarTrailing) {
			Button {
				showingLabelSheet = true
			} label: {
				Label("QR Label", systemImage: "qrcode")
			}
		}
	}
}

#Preview {
	NavigationStack {
		LocationDetailView(locationId: "10000000-0000-4000-8000-000000000001")
	}
	.environment(AppModel.preview())
	.environment(Router())
}
