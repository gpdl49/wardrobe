import SwiftUI
import WardrobeKit

/// Sheet for selecting a destination location when moving items.
struct LocationMoveSheet: View {
	@Environment(AppModel.self) private var model
	@Environment(\.dismiss) private var dismiss

	let itemIds: [ID]
	let ownerId: ID
	let currentLocationId: ID?
	let onMove: (ID?) async -> Void

	@State private var availableLocations: [LocationDTO] = []
	@State private var selectedDestination: ID?
	@State private var isMoving = false
	@State private var errorMessage: String?

	var body: some View {
		NavigationStack {
			List {
				Section {
					Button {
						selectedDestination = nil
					} label: {
						HStack {
							Label("No location", systemImage: "tray.and.arrow.up")
							Spacer()
							if selectedDestination == nil {
								Image(systemName: "checkmark")
									.foregroundStyle(.tint)
							}
						}
					}
					.foregroundStyle(.primary)
				} header: {
					Text("Unpack")
				} footer: {
					Text("Removes the selected items from any location.")
				}

				Section("Move to Location") {
					ForEach(availableLocations.filter { $0.id != currentLocationId }) { loc in
						Button {
							selectedDestination = loc.id
						} label: {
							HStack {
								Label(loc.code, systemImage: loc.kind.symbolName)
									.font(.body.monospaced())
								Text(loc.name)
									.foregroundStyle(.secondary)
								Spacer()
								if selectedDestination == loc.id {
									Image(systemName: "checkmark")
										.foregroundStyle(.tint)
								}
							}
						}
						.foregroundStyle(.primary)
					}
				}
			}
			.navigationTitle("Move \(itemIds.count) Item\(itemIds.count == 1 ? "" : "s")")
			.navigationBarTitleDisplayMode(.inline)
			.toolbar {
				ToolbarItem(placement: .cancellationAction) {
					Button("Cancel") { dismiss() }
				}
				ToolbarItem(placement: .confirmationAction) {
					Button("Move") {
						Task {
							isMoving = true
							await onMove(selectedDestination)
							isMoving = false
							dismiss()
						}
					}
					.disabled(isMoving || (selectedDestination == currentLocationId))
				}
			}
			.errorAlert($errorMessage)
			.task {
				await loadLocations()
			}
		}
	}

	private func loadLocations() async {
		do {
			availableLocations = try await model.api.locations(
				LocationQuery(owner: ownerId, archived: false)
			)
		} catch {
			errorMessage = model.message(for: error)
		}
	}
}
