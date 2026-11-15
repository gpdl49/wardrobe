import SwiftUI
import WardrobeKit

/// Edit colors for an item: add, remove, and reorder.
struct ColorEditorView: View {
	@Binding var colors: [ItemColor]

	@State private var showingAddColor: Bool = false
	@State private var newColorName: String = ""
	@State private var newColorHex: String = "#000000"
	@State private var newColorShare: Double = 0.5

	public static let palettePresets: [(name: String, hex: String)] = [
		("black", "#1a1a1a"),
		("white", "#ffffff"),
		("grey", "#808080"),
		("navy", "#1f2a44"),
		("blue", "#2563eb"),
		("brown", "#78350f"),
		("beige", "#d4b996"),
		("green", "#15803d"),
		("olive", "#556b2f"),
		("red", "#dc2626"),
		("burgundy", "#800020"),
		("pink", "#ec4899"),
		("yellow", "#eab308"),
		("orange", "#ea580c"),
		("purple", "#9333ea")
	]

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			if colors.isEmpty {
				Text("No colours assigned.")
					.font(.subheadline)
					.foregroundStyle(.secondary)
			} else {
				List {
					ForEach(Array(colors.enumerated()), id: \.offset) { index, color in
						HStack(spacing: 12) {
							Circle()
								.fill(Color(hex: color.hex))
								.frame(width: 20, height: 20)
								.overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1))

							Text(color.name.capitalized)
								.font(.subheadline)

							Spacer()

							Text("\(Int(round(color.share * 100)))%")
								.font(.caption)
								.foregroundStyle(.secondary)

							Button(role: .destructive) {
								colors.remove(at: index)
							} label: {
								Image(systemName: "trash")
									.foregroundStyle(.red)
							}
							.buttonStyle(.plain)
							.accessibilityLabel("Remove \(color.name)")
						}
					}
					.onMove { indices, newOffset in
						colors.move(fromOffsets: indices, toOffset: newOffset)
					}
				}
				.listStyle(.plain)
				.frame(minHeight: CGFloat(colors.count * 44))
			}

			Button {
				showingAddColor = true
			} label: {
				Label("Add colour", systemImage: "plus")
					.font(.subheadline)
			}
			.sheet(isPresented: $showingAddColor) {
				NavigationStack {
					Form {
						Section("Presets") {
							ScrollView(.horizontal, showsIndicators: false) {
								HStack(spacing: 8) {
									ForEach(Self.palettePresets, id: \.hex) { preset in
										Button {
											newColorName = preset.name
											newColorHex = preset.hex
										} label: {
											VStack(spacing: 4) {
												Circle()
													.fill(Color(hex: preset.hex))
													.frame(width: 32, height: 32)
													.overlay(Circle().stroke(Color.secondary.opacity(0.3), lineWidth: 1))
												Text(preset.name.capitalized)
													.font(.caption2)
											}
										}
										.buttonStyle(.plain)
									}
								}
								.padding(.vertical, 4)
							}
						}

						Section("Custom") {
							TextField("Name (e.g. navy)", text: $newColorName)
								.textInputAutocapitalization(.never)
							TextField("Hex (e.g. #1f2a44)", text: $newColorHex)
								.textInputAutocapitalization(.never)
								.autocorrectionDisabled()
							HStack {
								Text("Share: \(Int(round(newColorShare * 100)))%")
								Slider(value: $newColorShare, in: 0.05...1.0, step: 0.05)
							}
						}
					}
					.navigationTitle("Add colour")
					.navigationBarTitleDisplayMode(.inline)
					.toolbar {
						ToolbarItem(placement: .cancellationAction) {
							Button("Cancel") { showingAddColor = false }
						}
						ToolbarItem(placement: .confirmationAction) {
							Button("Add") {
								let name = newColorName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
								var hex = newColorHex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
								if !hex.hasPrefix("#") { hex = "#" + hex }
								if !name.isEmpty {
									colors.append(ItemColor(name: name, hex: hex, share: newColorShare))
									colors.sort { $0.share > $1.share }
								}
								newColorName = ""
								showingAddColor = false
							}
							.disabled(newColorName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
						}
					}
				}
				.presentationDetents([.medium])
			}
		}
	}
}
