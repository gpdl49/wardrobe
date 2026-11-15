import SwiftUI
import WardrobeKit

/// Tag editor with tag chips, text input, and suggestions.
struct TagEditorView: View {
	@Binding var tags: [String]
	var suggestions: [TagCountDTO] = []

	@State private var newTagText: String = ""

	var filteredSuggestions: [TagCountDTO] {
		let query = newTagText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
		let existing = Set(tags.map { $0.lowercased() })
		return suggestions
			.filter { !existing.contains($0.name.lowercased()) }
			.filter { query.isEmpty || $0.name.lowercased().contains(query) }
			.prefix(8)
			.map { $0 }
	}

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			if !tags.isEmpty {
				FlowLayout(spacing: 6) {
					ForEach(tags, id: \.self) { tag in
						HStack(spacing: 4) {
							Text(tag)
								.font(.subheadline)
							Button {
								removeTag(tag)
							} label: {
								Image(systemName: "xmark.circle.fill")
									.font(.caption)
									.foregroundStyle(.secondary)
							}
							.accessibilityLabel("Remove \(tag)")
						}
						.padding(.horizontal, 10)
						.padding(.vertical, 5)
						.background(Color.secondary.opacity(0.15), in: Capsule())
					}
				}
			}

			HStack {
				TextField("Add a tag…", text: $newTagText)
					.textInputAutocapitalization(.never)
					.autocorrectionDisabled()
					.onSubmit { addTag() }

				if !newTagText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
					Button("Add") {
						addTag()
					}
					.buttonStyle(.bordered)
					.controlSize(.small)
				}
			}

			if !filteredSuggestions.isEmpty {
				ScrollView(.horizontal, showsIndicators: false) {
					HStack(spacing: 6) {
						ForEach(filteredSuggestions, id: \.name) { item in
							Button {
								addSuggestedTag(item.name)
							} label: {
								HStack(spacing: 4) {
									Text(item.name)
									Text("(\(item.count))")
										.foregroundStyle(.tertiary)
								}
								.font(.caption)
								.padding(.horizontal, 8)
								.padding(.vertical, 4)
								.background(Color.accentColor.opacity(0.12), in: Capsule())
							}
							.buttonStyle(.plain)
						}
					}
					.padding(.vertical, 2)
				}
			}
		}
	}

	private func addTag() {
		let normalized = newTagText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
		guard !normalized.isEmpty else { return }
		if !tags.contains(where: { $0.lowercased() == normalized }) {
			tags.append(normalized)
		}
		newTagText = ""
	}

	private func addSuggestedTag(_ name: String) {
		let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
		guard !normalized.isEmpty else { return }
		if !tags.contains(where: { $0.lowercased() == normalized }) {
			tags.append(normalized)
		}
		newTagText = ""
	}

	private func removeTag(_ tag: String) {
		tags.removeAll { $0 == tag }
	}
}

/// Simple flow layout helper for tags wrapping onto multiple lines.
struct FlowLayout: Layout {
	var spacing: CGFloat = 6

	func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
		let width = proposal.width ?? .infinity
		var currentX: CGFloat = 0
		var currentY: CGFloat = 0
		var lineHeight: CGFloat = 0

		for subview in subviews {
			let size = subview.sizeThatFits(.unspecified)
			if currentX + size.width > width && currentX > 0 {
				currentX = 0
				currentY += lineHeight + spacing
				lineHeight = 0
			}
			currentX += size.width + spacing
			lineHeight = max(lineHeight, size.height)
		}

		return CGSize(width: width, height: currentY + lineHeight)
	}

	func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
		var currentX = bounds.minX
		var currentY = bounds.minY
		var lineHeight: CGFloat = 0

		for subview in subviews {
			let size = subview.sizeThatFits(.unspecified)
			if currentX + size.width > bounds.maxX && currentX > bounds.minX {
				currentX = bounds.minX
				currentY += lineHeight + spacing
				lineHeight = 0
			}
			subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
			currentX += size.width + spacing
			lineHeight = max(lineHeight, size.height)
		}
	}
}
