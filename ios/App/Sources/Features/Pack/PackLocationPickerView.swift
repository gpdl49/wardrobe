import SwiftUI
import WardrobeKit

/// A list and search interface to choose a location for packing or unpacking.
struct PackLocationPickerView: View {
	let title: String
	let subtitle: String?
	let locations: [LocationDTO]
	let preferKinds: [LocationKind]
	let excludeId: ID?
	let onSelect: (LocationDTO) -> Void
	let onScanTap: () -> Void

	@State private var searchText = ""

	init(
		title: String,
		subtitle: String? = nil,
		locations: [LocationDTO],
		preferKinds: [LocationKind] = [.bag, .suitcase],
		excludeId: ID? = nil,
		onSelect: @escaping (LocationDTO) -> Void,
		onScanTap: @escaping () -> Void
	) {
		self.title = title
		self.subtitle = subtitle
		self.locations = locations
		self.preferKinds = preferKinds
		self.excludeId = excludeId
		self.onSelect = onSelect
		self.onScanTap = onScanTap
	}

	private var filteredLocations: [LocationDTO] {
		let available = locations.filter { loc in
			loc.id != excludeId
		}

		let searched: [LocationDTO]
		if searchText.trimmingCharacters(in: .whitespaces).isEmpty {
			searched = available
		} else {
			let q = searchText.trimmingCharacters(in: .whitespaces)
			searched = available.filter { loc in
				loc.code.localizedCaseInsensitiveContains(q) || loc.name.localizedCaseInsensitiveContains(q)
			}
		}

		return searched.sorted { a, b in
			let aPreferred = preferKinds.contains(a.kind)
			let bPreferred = preferKinds.contains(b.kind)
			if aPreferred != bPreferred {
				return aPreferred && !bPreferred
			}
			return a.name.localizedStandardCompare(b.name) == .orderedAscending
		}
	}

	private var preferredGroup: [LocationDTO] {
		filteredLocations.filter { preferKinds.contains($0.kind) }
	}

	private var otherGroup: [LocationDTO] {
		filteredLocations.filter { !preferKinds.contains($0.kind) }
	}

	var body: some View {
		List {
			if let subtitle {
				Section {
					Text(subtitle)
						.font(.subheadline)
						.foregroundStyle(.secondary)
				}
			}

			if !preferredGroup.isEmpty {
				Section(header: Text(preferKinds.contains(.bag) ? "Bags and Suitcases" : "Preferred Locations")) {
					ForEach(preferredGroup) { loc in
						locationRow(loc)
					}
				}
			}

			if !otherGroup.isEmpty {
				Section(header: Text(preferredGroup.isEmpty ? "All Locations" : "Other Locations")) {
					ForEach(otherGroup) { loc in
						locationRow(loc)
					}
				}
			}

			if filteredLocations.isEmpty {
				ContentUnavailableView(
					"No locations found",
					systemImage: "shippingbox",
					description: Text(searchText.isEmpty ? "No locations available." : "No locations match \"\(searchText)\".")
				)
			}
		}
		.navigationTitle(title)
		.searchable(text: $searchText, prompt: "Search code or name")
		.toolbar {
			ToolbarItem(placement: .primaryAction) {
				Button(action: onScanTap) {
					Label("Scan QR", systemImage: "qrcode.viewfinder")
				}
			}
		}
	}

	@ViewBuilder
	private func locationRow(_ location: LocationDTO) -> some View {
		let isViewOnly = location.access == .view
		Button {
			if !isViewOnly {
				onSelect(location)
			}
		} label: {
			HStack(spacing: 12) {
				Image(systemName: location.kind.symbolName)
					.font(.title3)
					.foregroundStyle(isViewOnly ? .secondary : Color.accentColor)
					.frame(width: 32)

				VStack(alignment: .leading, spacing: 2) {
					HStack {
						Text(location.code)
							.font(.headline.monospaced())
							.foregroundStyle(isViewOnly ? .secondary : .primary)

						if isViewOnly {
							Text("View only")
								.font(.caption2.weight(.medium))
								.padding(.horizontal, 6)
								.padding(.vertical, 2)
								.background(Color(.secondarySystemFill))
								.clipShape(Capsule())
						}
					}

					Text(location.name)
						.font(.subheadline)
						.foregroundStyle(.secondary)
				}

				Spacer()

				Text("\(location.itemCount) items")
					.font(.caption)
					.foregroundStyle(.tertiary)

				Image(systemName: "chevron.right")
					.font(.footnote)
					.foregroundStyle(.quaternary)
			}
			.contentShape(Rectangle())
		}
		.disabled(isViewOnly)
	}
}
