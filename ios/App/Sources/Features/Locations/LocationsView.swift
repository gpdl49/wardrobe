import SwiftUI
import WardrobeKit

/// Locations tab root: tree/list, filters, create, and QR scanner (WP6).
public struct LocationsView: View {
	@Environment(AppModel.self) private var model
	@Environment(Router.self) private var router

	@State private var locationsModel: LocationsModel?
	@State private var showingCreateSheet = false
	@State private var showingScannerSheet = false
	@State private var scanErrorMessage: String?

	public init() {}

	private var canCreate: Bool {
		guard let scope = model.scope else { return model.me != nil }
		if scope.isMine { return true }
		return scope.access == .edit && scope.location == nil
	}

	public var body: some View {
		Group {
			if let locationsModel {
				if locationsModel.isLoading && locationsModel.locations.isEmpty {
					ProgressView("Loading locations…")
						.frame(maxWidth: .infinity, maxHeight: .infinity)
				} else if locationsModel.filteredLocations.isEmpty {
					emptyStateView(locationsModel: locationsModel)
				} else {
					locationListView(locationsModel: locationsModel)
				}
			} else {
				ProgressView()
			}
		}
		.navigationTitle("Locations")
		.searchable(
			text: Binding(
				get: { locationsModel?.searchText ?? "" },
				set: { locationsModel?.searchText = $0 }
			),
			prompt: "Search code, name, or notes"
		)
		.toolbar {
			toolbarContent
		}
		.sheet(isPresented: $showingCreateSheet) {
			LocationFormView(
				location: nil,
				ownerId: model.scope?.isMine == true ? nil : model.scope?.ownerId,
				defaultParentId: nil,
				lockParent: false,
				onSaved: { _ in
					Task { await locationsModel?.load() }
				}
			)
		}
		.sheet(isPresented: $showingScannerSheet) {
			ScannerView { scannedPayload in
				showingScannerSheet = false
				handleScanned(scannedPayload)
			} onCancel: {
				showingScannerSheet = false
			}
		}
		.errorAlert($scanErrorMessage)
		.errorAlert(Binding(
			get: { locationsModel?.errorMessage },
			set: { locationsModel?.errorMessage = $0 }
		))
		.task(id: model.scope?.ownerId) {
			let lm = locationsModel ?? LocationsModel(api: model.api)
			lm.ownerId = model.scope?.isMine == true ? nil : model.scope?.ownerId
			self.locationsModel = lm
			await lm.load()
		}
		.refreshable {
			await locationsModel?.load()
		}
	}

	// MARK: - List View

	private func locationListView(locationsModel: LocationsModel) -> some View {
		List {
			if locationsModel.selectedKind != nil || locationsModel.showArchived {
				Section {
					filterBanner(locationsModel: locationsModel)
				}
			}

			OutlineGroup(locationsModel.rootNodes, children: \.children) { node in
				NavigationLink(value: Route.location(node.location.id)) {
					LocationRowView(location: node.location)
				}
			}
		}
		.listStyle(.insetGrouped)
	}

	private func filterBanner(locationsModel: LocationsModel) -> some View {
		HStack {
			if let kind = locationsModel.selectedKind {
				Label(kind.label, systemImage: kind.symbolName)
					.font(.caption.weight(.medium))
					.padding(.horizontal, 8)
					.padding(.vertical, 4)
					.background(Color(.secondarySystemBackground))
					.clipShape(Capsule())
			}

			if locationsModel.showArchived {
				Text("Showing archived")
					.font(.caption.weight(.medium))
					.padding(.horizontal, 8)
					.padding(.vertical, 4)
					.background(Color(.secondarySystemBackground))
					.clipShape(Capsule())
			}

			Spacer()

			Button("Reset") {
				locationsModel.selectedKind = nil
				locationsModel.showArchived = false
				Task { await locationsModel.load() }
			}
			.font(.caption)
		}
	}

	// MARK: - Empty State

	private func emptyStateView(locationsModel: LocationsModel) -> some View {
		ContentUnavailableView {
			if !locationsModel.searchText.isEmpty {
				Label("No Matching Locations", systemImage: "magnifyingglass")
			} else if locationsModel.selectedKind != nil {
				Label("No \(locationsModel.selectedKind?.label ?? "") Locations", systemImage: "shippingbox")
			} else {
				Label("No Locations Yet", systemImage: "shippingbox")
			}
		} description: {
			if !locationsModel.searchText.isEmpty {
				Text("No locations matched \"\(locationsModel.searchText)\". Try another code or name.")
			} else if model.scope?.isMine == false {
				Text("Nothing has been shared with you in this wardrobe yet.")
			} else {
				Text("Add your vacuum bags, suitcases, closets and drawers to organize clothes and print QR labels.")
			}
		} actions: {
			if canCreate && locationsModel.searchText.isEmpty {
				Button("Create Location") {
					showingCreateSheet = true
				}
				.buttonStyle(.borderedProminent)
			}
		}
	}

	// MARK: - Toolbar

	@ToolbarContentBuilder
	private var toolbarContent: some ToolbarContent {
		ToolbarItem(placement: .topBarLeading) {
			WardrobeSwitcher()
		}

		ToolbarItemGroup(placement: .topBarTrailing) {
			filterMenu

			Button {
				showingScannerSheet = true
			} label: {
				Label("Scan QR", systemImage: "qrcode.viewfinder")
			}

			if canCreate {
				Button {
					showingCreateSheet = true
				} label: {
					Label("New Location", systemImage: "plus")
				}
			}
		}
	}

	private var filterMenu: some View {
		Menu {
			Picker("Kind", selection: Binding(
				get: { locationsModel?.selectedKind },
				set: { newKind in
					locationsModel?.selectedKind = newKind
				}
			)) {
				Text("All Kinds").tag(LocationKind?.none)
				ForEach(LocationKind.known, id: \.self) { kind in
					Label(kind.label, systemImage: kind.symbolName).tag(LocationKind?.some(kind))
				}
			}

			Toggle("Show Archived", isOn: Binding(
				get: { locationsModel?.showArchived ?? false },
				set: { newValue in
					locationsModel?.showArchived = newValue
					Task { await locationsModel?.load() }
				}
			))
		} label: {
			let isFiltered = (locationsModel?.selectedKind != nil) || (locationsModel?.showArchived == true)
			Image(systemName: isFiltered ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
		}
	}

	// MARK: - Scan Handler

	private func handleScanned(_ payload: String) {
		if let route = DeepLink.route(fromScanned: payload, baseURL: model.config.baseURL) {
			router.open(route)
		} else if let code = normalizeLocationCode(payload), let myId = model.me?.id {
			router.open(.label(ownerId: myId, code: code))
		} else {
			scanErrorMessage = "Not a Wardrobe label"
		}
	}
}

// MARK: - Row View

/// Row displaying location summary inside the hierarchical list.
struct LocationRowView: View {
	let location: LocationDTO

	var body: some View {
		HStack(spacing: 12) {
			Image(systemName: location.kind.symbolName)
				.foregroundStyle(.tint)
				.frame(width: 24)

			VStack(alignment: .leading, spacing: 2) {
				HStack(spacing: 6) {
					Text(location.code)
						.font(.body.monospaced().weight(.semibold))
						.foregroundStyle(.primary)

					if location.archivedAt != nil {
						Text("Archived")
							.font(.caption2.weight(.medium))
							.foregroundStyle(.secondary)
							.padding(.horizontal, 6)
							.padding(.vertical, 2)
							.background(Color(.systemGray5))
							.clipShape(Capsule())
					}
				}

				if location.name != location.code {
					Text(location.name)
						.font(.subheadline)
						.foregroundStyle(.secondary)
						.lineLimit(1)
				}
			}

			Spacer()

			HStack(spacing: 4) {
				Text("\(location.itemCount)")
					.font(.subheadline.monospacedDigit())
					.foregroundStyle(.secondary)
				Image(systemName: "tshirt")
					.font(.caption)
					.foregroundStyle(.tertiary)
			}
		}
		.padding(.vertical, 2)
	}
}

#Preview {
	NavigationStack {
		LocationsView()
	}
	.environment(AppModel.preview())
	.environment(Router())
}

