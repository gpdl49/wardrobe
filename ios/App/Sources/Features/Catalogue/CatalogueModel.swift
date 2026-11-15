import Foundation
import Observation
import WardrobeKit

struct ActiveFilterItem: Identifiable, Hashable {
	enum Kind: Hashable {
		case location(ID)
		case category(ID)
		case tag(String)
		case season(Season)
		case status(ItemStatus)
		case color(String)
	}

	let id: String
	let label: String
	let kind: Kind
}

/// View model for the catalogue tab.
@MainActor
@Observable
final class CatalogueModel {
	let api: any WardrobeAPI

	var scope: WardrobeScope?

	// Items & pagination
	private(set) var items: [ItemSummaryDTO] = []
	private(set) var nextCursor: String?
	private(set) var isLoading = false
	private(set) var isLoadingMore = false
	var errorMessage: String?
	private(set) var hasLoadedOnce = false

	// Filter state
	var searchText: String = "" {
		didSet {
			scheduleSearchDebounce()
		}
	}
	private(set) var debouncedSearchText: String = ""

	var selectedLocationId: ID?
	var selectedCategoryId: ID?
	var selectedTag: String?
	var selectedSeason: Season?
	var selectedStatus: ItemStatus?
	var selectedColor: String?

	// Metadata for filters
	private(set) var locations: [LocationDTO] = []
	private(set) var categories: [CategoryDTO] = []
	private(set) var tags: [TagCountDTO] = []
	private(set) var isLoadingMetadata = false

	private var searchTask: Task<Void, Never>?

	init(api: any WardrobeAPI, scope: WardrobeScope? = nil) {
		self.api = api
		self.scope = scope
	}

	// MARK: - Scope

	func updateScope(_ newScope: WardrobeScope?) async {
		guard scope != newScope else { return }
		scope = newScope
		// Locations and tags belong to one wardrobe; reset them on switch
		selectedLocationId = nil
		selectedTag = nil
		await reload()
		await loadMetadata()
	}

	// MARK: - Query Building

	func buildQuery(cursor: String? = nil) -> ItemQuery {
		var q = ItemQuery()

		if let scope, !scope.isMine {
			q.owner = scope.ownerId
			if let loc = scope.location, selectedLocationId == nil {
				q.location = loc.id
			}
		}

		if let locId = selectedLocationId {
			q.location = locId
		}

		if let catId = selectedCategoryId {
			q.category = catId
		}

		q.tag = selectedTag
		q.season = selectedSeason
		q.status = selectedStatus
		q.color = selectedColor

		let trimmed = debouncedSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
		if !trimmed.isEmpty {
			q.q = trimmed
		}

		q.cursor = cursor
		q.limit = 50
		return q
	}

	// MARK: - Loading

	func reload() async {
		isLoading = true
		errorMessage = nil
		nextCursor = nil

		do {
			let response = try await api.items(buildQuery(cursor: nil))
			items = response.items
			nextCursor = response.nextCursor
			hasLoadedOnce = true
		} catch {
			errorMessage = (error as? APIError)?.message ?? error.localizedDescription
		}

		isLoading = false
	}

	func loadMore() async {
		guard !isLoading, !isLoadingMore, let cursor = nextCursor, !cursor.isEmpty else {
			return
		}

		isLoadingMore = true

		do {
			let response = try await api.items(buildQuery(cursor: cursor))
			items.append(contentsOf: response.items)
			nextCursor = response.nextCursor
		} catch {
			errorMessage = (error as? APIError)?.message ?? error.localizedDescription
		}

		isLoadingMore = false
	}

	func loadMetadata() async {
		isLoadingMetadata = true
		let ownerId = (scope?.isMine == false) ? scope?.ownerId : nil

		async let locsCall = (try? await api.locations(LocationQuery(owner: ownerId))) ?? []
		async let catsCall = (try? await api.categories()) ?? []
		async let tagsCall = (try? await api.tags(owner: ownerId)) ?? []

		let (locs, cats, tgs) = await (locsCall, catsCall, tagsCall)
		locations = locs
		categories = cats
		tags = tgs
		isLoadingMetadata = false
	}

	// MARK: - Filters

	var activeFilterCount: Int {
		var count = 0
		if selectedLocationId != nil { count += 1 }
		if selectedCategoryId != nil { count += 1 }
		if selectedTag != nil { count += 1 }
		if selectedSeason != nil { count += 1 }
		if selectedStatus != nil { count += 1 }
		if selectedColor != nil { count += 1 }
		return count
	}

	var hasActiveFiltersOrSearch: Bool {
		activeFilterCount > 0 || !debouncedSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
	}

	var activeFilterItems: [ActiveFilterItem] {
		var list: [ActiveFilterItem] = []

		if let locId = selectedLocationId {
			let name = locations.first(where: { $0.id == locId })?.name ?? "Location"
			list.append(ActiveFilterItem(id: "loc-\(locId)", label: name, kind: .location(locId)))
		}

		if let catId = selectedCategoryId {
			let name = categories.first(where: { $0.id == catId })?.name ?? "Category"
			list.append(ActiveFilterItem(id: "cat-\(catId)", label: name, kind: .category(catId)))
		}

		if let tag = selectedTag {
			list.append(ActiveFilterItem(id: "tag-\(tag)", label: "#\(tag)", kind: .tag(tag)))
		}

		if let season = selectedSeason {
			list.append(ActiveFilterItem(id: "season-\(season.rawValue)", label: season.label, kind: .season(season)))
		}

		if let status = selectedStatus {
			list.append(ActiveFilterItem(id: "status-\(status.rawValue)", label: status.label, kind: .status(status)))
		}

		if let color = selectedColor {
			list.append(ActiveFilterItem(id: "color-\(color)", label: color.capitalized, kind: .color(color)))
		}

		return list
	}

	func clearFilter(_ kind: ActiveFilterItem.Kind) async {
		switch kind {
		case .location: selectedLocationId = nil
		case .category: selectedCategoryId = nil
		case .tag: selectedTag = nil
		case .season: selectedSeason = nil
		case .status: selectedStatus = nil
		case .color: selectedColor = nil
		}
		await reload()
	}

	func clearFilters() async {
		selectedLocationId = nil
		selectedCategoryId = nil
		selectedTag = nil
		selectedSeason = nil
		selectedStatus = nil
		selectedColor = nil
		searchText = ""
		debouncedSearchText = ""
		await reload()
	}

	// For tests or immediate search
	func applySearchImmediate(_ text: String) async {
		searchTask?.cancel()
		searchText = text
		debouncedSearchText = text
		await reload()
	}

	private func scheduleSearchDebounce() {
		searchTask?.cancel()
		let text = searchText
		searchTask = Task {
			try? await Task.sleep(nanoseconds: 300_000_000)
			if !Task.isCancelled {
				debouncedSearchText = text
				await reload()
			}
		}
	}
}
