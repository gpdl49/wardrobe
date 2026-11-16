import SwiftUI
import WardrobeKit

/// Sheet to search catalogue and add existing items into the current packing session.
struct AddExistingItemSheet: View {
	let api: any WardrobeAPI
	let ownerId: ID?
	let location: LocationRef
	let sessionId: ID
	let onAdded: (ItemSummaryDTO) -> Void

	@Environment(\.dismiss) private var dismiss
	@Environment(AppModel.self) private var appModel
	@State private var searchText = ""
	@State private var searchResults: [ItemSummaryDTO] = []
	@State private var isLoading = false
	@State private var errorMessage: String?
	@State private var addingItemId: ID?

	var body: some View {
		NavigationStack {
			List {
				if isLoading {
					HStack {
						Spacer()
						ProgressView("Searching items…")
						Spacer()
					}
					.listRowBackground(Color.clear)
				} else if searchResults.isEmpty && !searchText.isEmpty {
					ContentUnavailableView.search(text: searchText)
				} else if searchResults.isEmpty {
					ContentUnavailableView(
						"Search for Clothes",
						systemImage: "tshirt",
						description: Text("Type the name, brand, or tag of an existing item to pack it.")
					)
				} else {
					ForEach(searchResults) { item in
						itemRow(item)
					}
				}
			}
			.navigationTitle("Add Existing Item")
			.navigationBarTitleDisplayMode(.inline)
			.searchable(text: $searchText, prompt: "Search clothes to pack")
			.onChange(of: searchText) { _, newValue in
				Task {
					await search(query: newValue)
				}
			}
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") { dismiss() }
				}
			}
			.errorAlert($errorMessage)
		}
	}

	@ViewBuilder
	private func itemRow(_ item: ItemSummaryDTO) -> some View {
		let isAdding = addingItemId == item.id
		HStack(spacing: 12) {
			RemotePhotoView(photo: item.coverPhoto, variant: .thumb)
				.frame(width: 44, height: 44)
				.clipShape(RoundedRectangle(cornerRadius: 8))

			VStack(alignment: .leading, spacing: 2) {
				Text(item.name ?? "Unnamed item").opacity(item.nameGenerated == true ? 0.6 : 1)
					.font(.headline)
					.lineLimit(1)

				HStack(spacing: 6) {
					if let cat = item.category?.name {
						Text(cat)
							.font(.caption)
							.foregroundStyle(.secondary)
					}
					if let currentLoc = item.location {
						Text("in \(currentLoc.code)")
							.font(.caption.monospaced())
							.foregroundStyle(.tertiary)
					}
				}
			}

			Spacer()

			Button {
				addItem(item)
			} label: {
				if isAdding {
					ProgressView()
						.controlSize(.small)
				} else {
					Label("Pack", systemImage: "plus.circle.fill")
						.labelStyle(.iconOnly)
						.font(.title2)
						.foregroundStyle(Color.accentColor)
				}
			}
			.disabled(isAdding)
			.buttonStyle(.plain)
			.accessibilityLabel("Pack \(item.name ?? "item")")
		}
	}

	private func search(query: String) async {
		let trimmed = query.trimmingCharacters(in: .whitespaces)
		guard !trimmed.isEmpty else {
			searchResults = []
			return
		}

		isLoading = true
		do {
			let result = try await api.items(ItemQuery(owner: ownerId, q: trimmed, limit: 30))
			// Exclude items already in this location
			searchResults = result.items.filter { $0.location?.id != location.id }
			isLoading = false
		} catch {
			isLoading = false
			if !(error is CancellationError) {
				errorMessage = appModel.message(for: error)
			}
		}
	}

	private func addItem(_ item: ItemSummaryDTO) {
		addingItemId = item.id
		Task {
			do {
				_ = try await api.moveItems(
					MoveItemsRequest(
						itemIds: [item.id],
						toLocationId: location.id,
						sessionId: sessionId
					)
				)
				onAdded(item)
				addingItemId = nil
				searchResults.removeAll { $0.id == item.id }
			} catch {
				addingItemId = nil
				errorMessage = appModel.message(for: error)
			}
		}
	}
}
