import Foundation
import Testing
@testable import Wardrobe

@MainActor
@Suite struct DeepLinkTests {
	let base = URL(string: "https://wardrobe.vidur.xyz")!

	@Test func labelURL() {
		let r = DeepLink.route(from: URL(string: "https://wardrobe.vidur.xyz/l/ABC-uuid/b-07")!, baseURL: base)
		#expect(r == .label(ownerId: "abc-uuid", code: "B-07"))
	}

	@Test func rejectsOtherHostsAndPaths() {
		#expect(DeepLink.route(from: URL(string: "https://evil.example/l/u/B-07")!, baseURL: base) == nil)
		#expect(DeepLink.route(from: URL(string: "https://wardrobe.vidur.xyz/items/x")!, baseURL: base) == nil)
		#expect(DeepLink.route(from: URL(string: "xyz.vidur.wardrobe://oauth/callback?code=1")!, baseURL: base) == nil)
		#expect(DeepLink.route(fromScanned: "hello", baseURL: base) == nil)
	}

	@Test func customScheme() {
		#expect(DeepLink.route(from: URL(string: "xyz.vidur.wardrobe://item/i1")!, baseURL: base) == .item("i1"))
		#expect(DeepLink.route(from: URL(string: "xyz.vidur.wardrobe://location/l1")!, baseURL: base) == .location("l1"))
	}

	@Test func labelRoundTrip() {
		let url = DeepLink.labelURL(ownerId: "u1", code: "CL-BEDROOM", baseURL: base)
		#expect(url.absoluteString == "https://wardrobe.vidur.xyz/l/u1/CL-BEDROOM")
		#expect(DeepLink.route(from: url, baseURL: base) == .label(ownerId: "u1", code: "CL-BEDROOM"))
	}

	@Test func routerSelectsOwningTab() {
		let router = Router()
		router.open(.label(ownerId: "u", code: "B-07"))
		#expect(router.tab == .locations)
		#expect(router.path(.locations) == [.label(ownerId: "u", code: "B-07")])
	}
}
