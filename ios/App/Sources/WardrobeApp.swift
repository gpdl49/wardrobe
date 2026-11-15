import SwiftUI
import WardrobeKit

@main
struct WardrobeApp: App {
	@State private var model = AppModel.forLaunch()
	@Environment(\.scenePhase) private var scenePhase

	var body: some Scene {
		WindowGroup {
			RootView()
				.environment(model)
				.environment(model.auth)
				.environment(model.uploads)
				.environment(model.router)
				.onOpenURL { model.router.open(url: $0, baseURL: model.config.baseURL) }
				.onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
					if let url = activity.webpageURL { model.router.open(url: url, baseURL: model.config.baseURL) }
				}
		}
		.onChange(of: scenePhase) { _, phase in
			if phase == .active { model.uploads.resume() }
		}
	}
}
