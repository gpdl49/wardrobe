import SwiftUI
import WardrobeKit

enum CatalogueViewMode: String, CaseIterable {
	case grid
	case list
}

/// Catalogue tab root (WP4).
struct CatalogueView: View {
	@Environment(AppModel.self) private var appModel
	@Environment(Router.self) private var router
	@Environment(\.horizontalSizeClass) private var horizontalSizeClass

	@AppStorage("catalogue.viewMode") private var viewMode: CatalogueViewMode = .grid
	@State private var model: CatalogueModel?
	@State private var showFiltersSheet = false
	@State private var showNewItemSheet = false

	var body: some View {
		Group {
			if let model {
				catalogueContent(model)
			} else {
				ProgressView("Loading…")
			}
		}
		.navigationTitle(appModel.scopes.count > 1 ? "" : "Catalogue")
		.navigationBarTitleDisplayMode(.inline)
		.toolbar {
			if UIDevice.current.userInterfaceIdiom == .pad, canAddItem {
				ToolbarItem(placement: .topBarLeading) {
					addItemButton
				}
			}
			ToolbarItem(placement: .topBarLeading) {
				WardrobeSwitcher()
			}
			ToolbarItemGroup(placement: .topBarTrailing) {
				Button {
					viewMode = (viewMode == .grid ? .list : .grid)
				} label: {
					Image(systemName: viewMode == .grid ? "list.bullet" : "square.grid.2x2")
				}
				.accessibilityLabel(viewMode == .grid ? "Switch to list view" : "Switch to grid view")

				Button {
					showFiltersSheet = true
				} label: {
					ZStack(alignment: .topTrailing) {
						Image(systemName: (model?.activeFilterCount ?? 0) > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
						if let count = model?.activeFilterCount, count > 0 {
							Text("\(count)")
								.font(.system(size: 10, weight: .bold))
								.foregroundStyle(.white)
								.padding(3)
								.background(Color.accentColor)
								.clipShape(Circle())
								.offset(x: 6, y: -6)
						}
					}
				}
				.accessibilityLabel("Filters")

				if UIDevice.current.userInterfaceIdiom != .pad, canAddItem {
					addItemButton
				}
			}
		}
		.task {
			if model == nil {
				let m = CatalogueModel(api: appModel.api, scope: appModel.scope)
				m.appModel = appModel
				model = m
				await m.reload()
				await m.loadMetadata()
			}
		}
		.task(id: appModel.scope?.id) {
			if let model {
				await model.updateScope(appModel.scope)
			}
		}
		.onChange(of: appModel.uploads.jobs.filter { $0.phase == .done }.map(\.id)) { old, completed in
			if !Set(completed).subtracting(old).isEmpty {
				Task { await model?.reload() }
			}
		}
		.sheet(isPresented: $showFiltersSheet, onDismiss: {
			if let model {
				Task { await model.reload() }
			}
		}) {
			if let model {
				CatalogueFilterSheet(model: model)
			}
		}
		.sheet(isPresented: $showNewItemSheet) {
			NewItemView(ownerId: appModel.scope?.ownerId) { createdId in
				showNewItemSheet = false
				router.open(.item(createdId))
			}
		}
	}

	private var canAddItem: Bool {
		appModel.scope?.access.canEdit ?? true
	}

	private var addItemButton: some View {
		Button {
			showNewItemSheet = true
		} label: {
			Label("Add new item", systemImage: "plus")
		}
	}

	@ViewBuilder
	private func catalogueContent(_ model: CatalogueModel) -> some View {
		@Bindable var bindableModel = model

		VStack(spacing: 0) {
			if !model.activeFilterItems.isEmpty {
				activeFiltersBar(model)
			}

			if model.isLoading && model.items.isEmpty {
				Spacer()
				ProgressView("Loading items…")
				Spacer()
			} else if !model.isLoading && model.items.isEmpty {
				emptyStateView(model)
			} else {
				itemsListView(model)
			}
		}
		.searchable(
			text: $bindableModel.searchText,
			placement: UIDevice.current.userInterfaceIdiom == .pad ? .navigationBarDrawer(displayMode: .always) : .automatic,
			prompt: "Search clothes, brands, tags…"
		)
		.refreshable {
			await model.reload()
		}
		.errorAlert($bindableModel.errorMessage)
	}

	@ViewBuilder
	private func activeFiltersBar(_ model: CatalogueModel) -> some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 8) {
				ForEach(model.activeFilterItems) { item in
					HStack(spacing: 4) {
						Text(item.label)
							.font(.caption)
						Button {
							Task { await model.clearFilter(item.kind) }
						} label: {
							Image(systemName: "xmark")
								.font(.system(size: 10, weight: .bold))
						}
					}
					.padding(.horizontal, 10)
					.padding(.vertical, 5)
					.background(Color(.secondarySystemFill))
					.clipShape(Capsule())
				}

				Button("Clear all") {
					Task { await model.clearFilters() }
				}
				.font(.caption.bold())
				.padding(.horizontal, 8)
			}
			.padding(.horizontal, 16)
			.padding(.vertical, 8)
		}
		.background(.bar)
	}

	@ViewBuilder
	private func itemsListView(_ model: CatalogueModel) -> some View {
		ScrollView {
			if viewMode == .grid {
				let columns = adaptiveColumns
				LazyVGrid(columns: columns, spacing: 16) {
					ForEach(model.items) { item in
						NavigationLink(value: Route.item(item.id)) {
							CatalogueGridTile(item: item)
						}
						.buttonStyle(.plain)
						.onAppear {
							if item.id == model.items.last?.id {
								Task { await model.loadMore() }
							}
						}
					}
				}
				.padding(16)
			} else {
				LazyVStack(spacing: 12) {
					ForEach(model.items) { item in
						NavigationLink(value: Route.item(item.id)) {
							CatalogueListRow(item: item)
						}
						.buttonStyle(.plain)
						.onAppear {
							if item.id == model.items.last?.id {
								Task { await model.loadMore() }
							}
						}
						if item.id != model.items.last?.id {
							Divider()
						}
					}
				}
				.padding(16)
			}

			if model.isLoadingMore {
				ProgressView()
					.frame(maxWidth: .infinity)
					.padding()
			}
		}
	}

	private var adaptiveColumns: [GridItem] {
		if horizontalSizeClass == .regular {
			// iPad: 4–6 columns
			return [GridItem(.adaptive(minimum: 160), spacing: 16)]
		} else {
			// iPhone: 2–3 columns
			return [GridItem(.adaptive(minimum: 150), spacing: 12)]
		}
	}

	@ViewBuilder
	private func emptyStateView(_ model: CatalogueModel) -> some View {
		if model.hasActiveFiltersOrSearch {
			ContentUnavailableView {
				Label("No items match", systemImage: "magnifyingglass")
			} description: {
				Text("Try fewer filters or a different search.")
			} actions: {
				Button("Clear filters") {
					Task { await model.clearFilters() }
				}
				.buttonStyle(.borderedProminent)
			}
		} else if model.scope?.isMine == false {
			ContentUnavailableView {
				Label("Nothing to show", systemImage: "tshirt")
			} description: {
				Text("Nothing has been shared with you in this wardrobe yet.")
			}
		} else {
			ContentUnavailableView {
				Label("Nothing catalogued yet", systemImage: "tshirt")
			} description: {
				Text("Items appear here as you photograph them while packing.")
			} actions: {
				if appModel.scope?.access.canEdit ?? true {
					Button("Add item") {
						showNewItemSheet = true
					}
					.buttonStyle(.borderedProminent)
				}
			}
		}
	}
}

#Preview {
	NavigationStack {
		CatalogueView()
	}
	.environment(AppModel.preview())
	.environment(Router())
}
