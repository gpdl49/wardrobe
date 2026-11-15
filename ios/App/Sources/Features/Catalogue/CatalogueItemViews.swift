import SwiftUI
import WardrobeKit

/// Grid tile representing an item in the catalogue.
struct CatalogueGridTile: View {
	let item: ItemSummaryDTO

	var body: some View {
		VStack(alignment: .leading, spacing: 6) {
			RemotePhotoView(photo: item.coverPhoto, variant: .thumb, contentMode: .fill)
				.aspectRatio(1, contentMode: .fit)
				.clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
				.overlay(alignment: .topTrailing) {
					if item.status != .active {
						Text(item.status.label)
							.font(.caption2.bold())
							.padding(.horizontal, 6)
							.padding(.vertical, 2)
							.background(.ultraThinMaterial)
							.clipShape(Capsule())
							.padding(6)
					}
				}

			VStack(alignment: .leading, spacing: 2) {
				Text(item.name ?? "Untitled item")
					.font(.subheadline.weight(.medium))
					.foregroundStyle(.primary)
					.lineLimit(1)

				HStack(spacing: 4) {
					if let brand = item.brand, !brand.isEmpty {
						Text(brand)
					}
					if let size = item.size, !size.isEmpty {
						if item.brand != nil { Text("•") }
						Text(size)
					}
				}
				.font(.caption)
				.foregroundStyle(.secondary)
				.lineLimit(1)

				if let loc = item.location {
					HStack(spacing: 3) {
						Image(systemName: loc.kind.symbolName)
							.font(.caption2)
						Text(loc.code)
							.font(.caption2)
					}
					.foregroundStyle(.secondary)
					.lineLimit(1)
				}
			}
		}
		.contentShape(Rectangle())
	}
}

/// List row representing an item in the catalogue.
struct CatalogueListRow: View {
	let item: ItemSummaryDTO

	var body: some View {
		HStack(spacing: 12) {
			RemotePhotoView(photo: item.coverPhoto, variant: .thumb, contentMode: .fill)
				.frame(width: 56, height: 56)
				.clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

			VStack(alignment: .leading, spacing: 3) {
				Text(item.name ?? "Untitled item")
					.font(.body.weight(.medium))
					.foregroundStyle(.primary)
					.lineLimit(1)

				HStack(spacing: 6) {
					if let brand = item.brand, !brand.isEmpty {
						Text(brand)
					}
					if let size = item.size, !size.isEmpty {
						if item.brand != nil { Text("•") }
						Text(size)
					}
					if let loc = item.location {
						Text("•")
						Text(loc.code)
					}
				}
				.font(.subheadline)
				.foregroundStyle(.secondary)
				.lineLimit(1)
			}

			Spacer()

			if item.status != .active {
				Text(item.status.label)
					.font(.caption)
					.padding(.horizontal, 8)
					.padding(.vertical, 3)
					.background(Color(.secondarySystemFill))
					.clipShape(Capsule())
			}
		}
		.padding(.vertical, 2)
	}
}
