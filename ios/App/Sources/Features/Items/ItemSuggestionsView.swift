import SwiftUI
import WardrobeKit

/// Suggestions panel displaying vision and colour analyses, with field acceptance and re-run.
struct ItemSuggestionsView: View {
	let item: ItemDetailDTO
	let categories: [CategoryDTO]
	let canEdit: Bool
	let isRerunning: Bool
	let message: String?
	let pendingFields: [ID: Set<ItemSuggestion.Field>]
	var onRerun: () -> Void
	var onAcceptField: (AnalysisDTO, ItemSuggestion.Field) -> Void
	var onAcceptAll: (AnalysisDTO, [ItemSuggestion.Field]) -> Void

	var sortedAnalyses: [AnalysisDTO] {
		item.analyses.sorted { $0.createdAt > $1.createdAt }
	}

	var isRunning: Bool {
		item.analyses.contains { $0.status == .queued || $0.status == .running }
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Label("Suggestions", systemImage: "sparkles")
					.font(.headline)
					.foregroundStyle(Color.accentColor)

				Spacer()

				if canEdit {
					Button {
						onRerun()
					} label: {
						HStack(spacing: 4) {
							if isRerunning || isRunning {
								ProgressView()
									.controlSize(.small)
							} else {
								Image(systemName: "arrow.clockwise")
							}
							Text(isRerunning || isRunning ? "Analysing…" : "Re-run analysis")
						}
						.font(.subheadline)
					}
					.disabled(isRerunning || isRunning)
				}
			}

			if let message {
				Text(message)
					.font(.caption)
					.foregroundStyle(.secondary)
					.padding(.horizontal, 4)
			}

			if sortedAnalyses.isEmpty {
				Text("No analyses yet. They run when a photo has been processed.")
					.font(.subheadline)
					.foregroundStyle(.secondary)
					.padding(.vertical, 8)
			} else {
				VStack(spacing: 12) {
					ForEach(sortedAnalyses) { analysis in
						analysisCard(analysis)
					}
				}
			}
		}
		.padding()
		.background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
	}

	@ViewBuilder
	private func analysisCard(_ analysis: AnalysisDTO) -> some View {
		VStack(alignment: .leading, spacing: 10) {
			HStack(alignment: .center, spacing: 8) {
				Text(analysis.kind == .colors ? "Colours" : "Vision")
					.font(.subheadline.bold())

				if let model = analysis.model {
					Text(model)
						.font(.caption2)
						.foregroundStyle(.tertiary)
						.lineLimit(1)
				}

				Spacer()

				Text(analysis.createdAt.formatted(date: .abbreviated, time: .shortened))
					.font(.caption2)
					.foregroundStyle(.secondary)

				statusBadge(for: analysis)
			}

			if analysis.status == .failed, let error = analysis.error {
				Text(error)
					.font(.caption)
					.foregroundStyle(.red)
			}

			if let result = analysis.result {
				let available = ItemSuggestionsHelper.availableFields(in: result)
				let open = ItemSuggestionsHelper.openFields(item: item, suggestion: result)
				let pending = pendingFields[analysis.id] ?? []

				if !available.isEmpty {
					VStack(spacing: 6) {
						ForEach(available, id: \.rawValue) { field in
							let isMatching = ItemSuggestionsHelper.matchesItem(item: item, field: field, suggestion: result)
							let label = ItemSuggestionsHelper.fields.first(where: { $0.0 == field })?.1 ?? field.rawValue.capitalized

							HStack(alignment: .center, spacing: 8) {
								Text(label)
									.font(.caption)
									.foregroundStyle(.secondary)
									.frame(width: 70, alignment: .leading)

								fieldContent(for: field, in: result)
									.font(.subheadline)
									.frame(maxWidth: .infinity, alignment: .leading)

								if isMatching {
									Image(systemName: "checkmark")
										.font(.caption.bold())
										.foregroundStyle(.green)
										.accessibilityLabel("\(label) already matches")
								} else if canEdit {
									Button {
										onAcceptField(analysis, field)
									} label: {
										if pending.contains(field) {
											ProgressView()
												.controlSize(.small)
										} else {
											Text("Accept")
												.font(.caption.bold())
										}
									}
									.buttonStyle(.bordered)
									.controlSize(.small)
									.disabled(!pending.isEmpty)
								}
							}
							.padding(.vertical, 4)
							.padding(.horizontal, 6)
							.background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 6))
						}
					}

					if canEdit && open.count > 1 {
						Button {
							onAcceptAll(analysis, open)
						} label: {
							HStack(spacing: 4) {
								if !pending.isEmpty {
									ProgressView()
										.controlSize(.small)
								}
								Text("Accept all (\(open.count))")
									.font(.subheadline.bold())
							}
						}
						.buttonStyle(.borderedProminent)
						.controlSize(.small)
						.disabled(!pending.isEmpty)
						.padding(.top, 4)
					}
				}
			}
		}
		.padding(10)
		.background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
	}

	@ViewBuilder
	private func statusBadge(for analysis: AnalysisDTO) -> some View {
		switch analysis.status {
		case .queued:
			HStack(spacing: 3) {
				ProgressView().controlSize(.mini)
				Text("Queued").font(.caption2)
			}
			.padding(.horizontal, 6)
			.padding(.vertical, 2)
			.background(Color.secondary.opacity(0.15), in: Capsule())
		case .running:
			HStack(spacing: 3) {
				ProgressView().controlSize(.mini)
				Text("Running").font(.caption2)
			}
			.padding(.horizontal, 6)
			.padding(.vertical, 2)
			.background(Color.accentColor.opacity(0.15), in: Capsule())
		case .failed:
			Text("Failed")
				.font(.caption2)
				.foregroundStyle(.red)
				.padding(.horizontal, 6)
				.padding(.vertical, 2)
				.background(Color.red.opacity(0.12), in: Capsule())
		case .done:
			if analysis.appliedAt != nil {
				Text("Applied")
					.font(.caption2)
					.foregroundStyle(.green)
					.padding(.horizontal, 6)
					.padding(.vertical, 2)
					.background(Color.green.opacity(0.15), in: Capsule())
			}
		default:
			EmptyView()
		}
	}

	@ViewBuilder
	private func fieldContent(for field: ItemSuggestion.Field, in suggestion: ItemSuggestion) -> some View {
		switch field {
		case .categorySlug:
			if let slug = suggestion.categorySlug {
				let cat = categories.first(where: { $0.slug == slug })
				let path = cat.flatMap { CategoryTreeHelper.path(for: $0.id, in: categories) } ?? cat?.name ?? slug
				Text(path)
			}
		case .colors:
			if let colors = suggestion.colors, !colors.isEmpty {
				HStack(spacing: 4) {
					ForEach(colors, id: \.hex) { c in
						Circle()
							.fill(Color(hex: c.hex))
							.frame(width: 12, height: 12)
					}
					Text(colors.map(\.name).joined(separator: ", "))
						.font(.caption)
				}
			}
		case .seasons:
			if let seasons = suggestion.seasons, !seasons.isEmpty {
				Text(seasons.map(\.label).joined(separator: ", "))
			}
		case .tags:
			if let tags = suggestion.tags, !tags.isEmpty {
				Text(tags.joined(separator: ", "))
			}
		case .labelText:
			if let labelText = suggestion.labelText {
				Text(labelText)
					.font(.caption)
			}
		case .name:
			Text(suggestion.name ?? "")
		case .brand:
			Text(suggestion.brand ?? "")
		case .size:
			Text(suggestion.size ?? "")
		case .pattern:
			Text(suggestion.pattern ?? "")
		case .material:
			Text(suggestion.material ?? "")
		}
	}
}
