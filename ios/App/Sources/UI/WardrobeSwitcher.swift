import SwiftUI
import WardrobeKit

/// Toolbar menu that sets `AppModel.scope` from `AppModel.scopes`; hidden
/// when the user has no shares (single scope).
struct WardrobeSwitcher: View {
	@Environment(AppModel.self) private var model

	var body: some View {
		if model.scopes.count > 1 {
			Menu {
				ForEach(model.scopes) { scope in
					Button {
						model.scope = scope
					} label: {
						HStack {
							Text(scope.title)
							if model.scope?.id == scope.id {
								Image(systemName: "checkmark")
							}
						}
					}
				}
			} label: {
				HStack(spacing: 4) {
					Text(model.scope?.title ?? "Wardrobe")
						.font(.headline)
						.foregroundStyle(.primary)
					Image(systemName: "chevron.down")
						.font(.caption.bold())
						.foregroundStyle(.secondary)
				}
				.accessibilityElement(children: .combine)
				.accessibilityLabel("Current wardrobe: \(model.scope?.title ?? "Wardrobe")")
				.accessibilityHint("Double tap to switch wardrobe")
			}
		}
	}
}

#Preview {
	WardrobeSwitcher()
		.environment(AppModel.preview())
}
