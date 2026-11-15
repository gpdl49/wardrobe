import SwiftUI
import WardrobeKit

/// Resolves a QR label (`/l/<ownerId>/<code>`) to a location (WP6).
/// Replaces itself with `LocationDetailView` on success, or offers creation if 404 in your own wardrobe.
public struct LocationCodeResolverView: View {
	@Environment(AppModel.self) private var model

	public let ownerId: ID
	public let code: String

	@State private var resolverModel: LocationCodeResolverModel?
	@State private var showingCreateSheet = false

	public init(ownerId: ID, code: String) {
		self.ownerId = ownerId
		self.code = code
	}

	public var body: some View {
		Group {
			if let resolverModel {
				switch resolverModel.state {
				case .loading:
					ProgressView("Resolving \(code)…")
						.frame(maxWidth: .infinity, maxHeight: .infinity)

				case .resolved(let location):
					LocationDetailView(locationId: location.id)

				case .notFound(let canCreate):
					ContentUnavailableView {
						Label("Not found or not shared with you", systemImage: "shippingbox.and.arrow.backward")
					} description: {
						Text("No location with code \"\(code)\" was found in this wardrobe.")
					} actions: {
						if canCreate {
							Button("Create location \(code)") {
								showingCreateSheet = true
							}
							.buttonStyle(.borderedProminent)
							.controlSize(.large)
						}
					}

				case .error(let message):
					ContentUnavailableView {
						Label("Error resolving location", systemImage: "exclamationmark.triangle")
					} description: {
						Text(message)
					} actions: {
						Button("Try again") {
							Task { await resolverModel.resolve() }
						}
						.buttonStyle(.bordered)
					}
				}
			} else {
				ProgressView()
			}
		}
		.sheet(isPresented: $showingCreateSheet) {
			LocationFormView(
				location: nil,
				ownerId: ownerId,
				defaultParentId: nil,
				lockParent: false,
				onSaved: { createdLocation in
					resolverModel?.setResolved(createdLocation)
				}
			)
		}
		.task(id: code + ownerId) {
			let rModel = LocationCodeResolverModel(
				api: model.api,
				ownerId: ownerId,
				code: code,
				myId: model.me?.id
			)
			rModel.appModel = model
			self.resolverModel = rModel
			await rModel.resolve()
		}
	}
}

#Preview {
	NavigationStack {
		LocationCodeResolverView(ownerId: "00000000-0000-4000-8000-000000000001", code: "CL-BEDROOM")
	}
	.environment(AppModel.preview())
	.environment(Router())
}
