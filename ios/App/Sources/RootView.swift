import SwiftUI
import WardrobeKit

/// Sign-in gate, then the tabs: a tab bar on iPhone, a sidebar on iPad
/// (`.sidebarAdaptable`). Each tab is a NavigationStack whose `Route`s are
/// resolved here, so any screen can push any other.
struct RootView: View {
	@Environment(AppModel.self) private var model
	@Environment(AuthSession.self) private var auth

	var body: some View {
		Group {
			switch auth.state {
			case .restoring:
				ProgressView().task { await auth.restore() }
			case .signedOut:
				SignInView()
			case .signedIn(let claims):
				signedIn
					.task(id: claims.sub) { await model.bootstrap() }
			}
		}
	}

	@ViewBuilder private var signedIn: some View {
		switch model.accessState {
		case .denied:
			NoAccessView()
		case .unknown:
			if let error = model.bootstrapError {
				ContentUnavailableView {
					Label("Can't reach Wardrobe", systemImage: "wifi.exclamationmark")
				} description: {
					Text(error)
				} actions: {
					Button("Try again") { Task { await model.bootstrap() } }
				}
			} else {
				ProgressView("Loading…")
			}
		case .granted:
			MainTabs().errorAlert(Binding(
				get: { model.bootstrapError },
				set: { model.bootstrapError = $0 }
			))
		}
	}
}

struct MainTabs: View {
	@Environment(Router.self) private var router
	@Environment(UploadQueue.self) private var uploads

	var body: some View {
		@Bindable var router = router
		TabView(selection: $router.tab) {
			Tab("Catalogue", systemImage: "tshirt", value: AppTab.catalogue) { stack(.catalogue) { CatalogueView() } }
			Tab("Locations", systemImage: "shippingbox", value: AppTab.locations) { stack(.locations) { LocationsView() } }
			Tab("Pack", systemImage: "arrow.down.to.line", value: AppTab.pack) { stack(.pack) { PackView() } }
			Tab("Unpack", systemImage: "arrow.up.to.line", value: AppTab.unpack) { stack(.unpack) { UnpackView() } }
			Tab("Sharing", systemImage: "person.2", value: AppTab.sharing) { stack(.sharing) { SharingView() } }
			Tab("Settings", systemImage: "gearshape", value: AppTab.settings) { stack(.settings) { SettingsView() } }
				.badge(uploads.failedCount)
		}
		.tabViewStyle(.sidebarAdaptable)
	}

	private func stack<Content: View>(_ tab: AppTab, @ViewBuilder content: () -> Content) -> some View {
		NavigationStack(path: Binding(get: { router.path(tab) }, set: { router.setPath(tab, $0) })) {
			content().routeDestinations()
		}
	}
}

extension View {
	/// Registers every `Route`; call once at the root of a NavigationStack.
	func routeDestinations() -> some View {
		navigationDestination(for: Route.self) { route in
			switch route {
			case .item(let id): ItemDetailView(itemId: id)
			case .location(let id): LocationDetailView(locationId: id)
			case .label(let ownerId, let code): LocationCodeResolverView(ownerId: ownerId, code: code)
			case .session(let id): SessionSummaryView(sessionId: id)
			}
		}
	}
}
