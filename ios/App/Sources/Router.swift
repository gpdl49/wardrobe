import Foundation
import Observation
import WardrobeKit

/// A screen another screen can push (registered once in `RootView`).
enum Route: Hashable {
	case item(ID)
	case location(ID)
	/// A QR label: resolve `code` in `ownerId`'s wardrobe.
	case label(ownerId: ID, code: String)
	case session(ID)
	case outfit(ID)
	case suggest
}

enum AppTab: String, Hashable, CaseIterable {
	case catalogue, outfits, locations, pack, unpack, sharing, settings
}

/// Parses deep links and scanned QR text (docs/ios/api-contract.md
/// "Deep links").
enum DeepLink {
	/// `https://<base host>/l/<ownerId>/<code>`, `xyz.vidur.wardrobe://item/<id>`
	/// or `…://location/<id>`. Nil for anything else (including the OAuth
	/// callback).
	static func route(from url: URL, baseURL: URL) -> Route? {
		let parts = url.pathComponents.filter { $0 != "/" }
		if url.scheme == "https" || url.scheme == "http" {
			guard url.host()?.lowercased() == baseURL.host()?.lowercased() else { return nil }
            if parts.count == 2 && parts[0] == "outfits" {
                return parts[1] == "suggest" ? .suggest : .outfit(parts[1])
            }
            guard parts.count == 3, parts[0] == "l", !parts[1].isEmpty,
				let code = parts[2].removingPercentEncoding.flatMap(normalizeLocationCode)
			else { return nil }
			return .label(ownerId: parts[1].lowercased(), code: code)
		}
		if url.scheme == "xyz.vidur.wardrobe", let host = url.host() {
            if host == "suggest" && parts.isEmpty { return .suggest }
            guard parts.count == 1 else { return nil }
			switch host {
			case "outfit": return .outfit(parts[0])
			case "item": return .item(parts[0])
			case "location": return .location(parts[0])
			default: return nil
			}
		}
		return nil
	}

	/// For scanned QR text.
	static func route(fromScanned text: String, baseURL: URL) -> Route? {
		guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
		return route(from: url, baseURL: baseURL)
	}

	/// The label URL a location's QR code encodes.
	static func labelURL(ownerId: ID, code: String, baseURL: URL) -> URL {
		baseURL.appending(path: "l").appending(path: ownerId).appending(path: code)
	}
}

/// Selected tab and one navigation path per tab.
@MainActor
@Observable
final class Router {
	var tab: AppTab = .catalogue
	var paths: [AppTab: [Route]] = [:]

	func path(_ tab: AppTab) -> [Route] { paths[tab] ?? [] }
	func setPath(_ tab: AppTab, _ path: [Route]) { paths[tab] = path }

	/// Push `route` on the tab that owns it (items: catalogue; locations and
	/// labels: locations) and select that tab.
	func open(_ route: Route) {
		let target: AppTab
		switch route {
		case .item: target = tab == .locations ? .locations : .catalogue
		case .location, .label: target = .locations
		case .session: target = tab
		case .outfit, .suggest: target = .outfits
		}
		tab = target
		paths[target, default: []].append(route)
	}

	func open(url: URL, baseURL: URL) {
		if let route = DeepLink.route(from: url, baseURL: baseURL) { open(route) }
	}
}
