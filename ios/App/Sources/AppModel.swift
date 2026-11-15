import Foundation
import Observation
import WardrobeKit
import WardrobeKitTesting

/// Whose wardrobe the catalogue and locations show (the wardrobe switcher).
struct WardrobeScope: Hashable, Identifiable, Sendable {
	var ownerId: ID
	/// "My wardrobe" or the owner's name.
	var title: String
	var access: Access
	/// Set when only one location (and what is nested in it) is shared.
	var location: SharedWithMeDTO.LocationStub?
	var id: String { ownerId + "/" + (location?.id ?? "*") }
	var isMine: Bool { access == .owner }
}

/// App-wide state and services, injected with `.environment(model)`.
@MainActor
@Observable
final class AppModel {
	enum AccessState: Hashable { case unknown, granted, denied }

	let config: AppConfig
	let auth: AuthSession
	let api: any WardrobeAPI
	let uploads: UploadQueue
	let images: ImagePipeline
	let router = Router()

	private(set) var me: MeDTO?
	private(set) var accessState: AccessState = .unknown
	private(set) var sharedWithMe: [SharedWithMeDTO] = []
	/// Selected wardrobe; nil until `me` loads (then "My wardrobe").
	var scope: WardrobeScope?
	/// Last app-level error (failed bootstrap), shown by RootView.
	var bootstrapError: String?

	init(config: AppConfig, auth: AuthSession, api: any WardrobeAPI, storageRoot: URL) {
		self.config = config
		self.auth = auth
		self.api = api
		self.uploads = UploadQueue(api: api, directory: storageRoot.appending(path: "uploads"))
		self.images = ImagePipeline(api: api, cacheDirectory: URL.cachesDirectory.appending(path: "photos"))
	}

	/// Every wardrobe the user can switch to: theirs, then shares.
	var scopes: [WardrobeScope] {
		guard let me else { return [] }
		let mine = WardrobeScope(ownerId: me.id, title: "My wardrobe", access: .owner, location: nil)
		let shared = sharedWithMe.map { s in
			WardrobeScope(
				ownerId: s.owner.id,
				title: s.location.map { "\(s.owner.displayName): \($0.name)" } ?? s.owner.displayName,
				access: s.access == .edit ? .edit : .view,
				location: s.location)
		}
		return [mine] + shared
	}

	/// After sign-in: GET /me (403 ⇒ no access), shares, start uploads.
	func bootstrap() async {
		bootstrapError = nil
		do {
			let me = try await api.me()
			self.me = me
			accessState = .granted
			if scope == nil || scope?.ownerId == me.id {
				scope = WardrobeScope(ownerId: me.id, title: "My wardrobe", access: .owner, location: nil)
			}
			uploads.start(userSub: me.sub)
			await refreshShares()
		} catch let e as APIError where e.isForbidden {
			accessState = .denied
		} catch let e as APIError where e.isSignedOut {
			_ = message(for: e)
		} catch {
			bootstrapError = message(for: error)
		}
	}

	func refreshShares() async {
		do { sharedWithMe = try await api.sharedWithMe() }
		catch { bootstrapError = message(for: error) }
	}

	func signOut() async {
		uploads.pause()
		await images.clear()
		me = nil; scope = nil; sharedWithMe = []; accessState = .unknown
		await auth.signOut()
	}

	/// Handles an error thrown by any API call in a view: ends the session
	/// on `signed_out`, else returns a message to show.
	func message(for error: any Error) -> String? {
		if error is CancellationError { return nil }
		if let e = error as? APIError, e.error == APIError.signedOut.error {
			uploads.pause()
			me = nil; scope = nil; sharedWithMe = []; accessState = .unknown
			auth.sessionEnded()
			Task { await images.clear() }
			return nil
		}
		return (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
	}
}

extension AppModel {
	/// Production, or in DEBUG builds: `-fixtures` (in-memory API, signed
	/// in) or `-devServer http://localhost:3000` (real API, `AUTH_MODE=dev`).
	static func forLaunch() -> AppModel {
		let config = AppConfig.fromBundle()
		let storage = URL.applicationSupportDirectory
		#if DEBUG
			let args = ProcessInfo.processInfo.arguments
			if args.contains("-fixtures") { return preview() }
			if let i = args.firstIndex(of: "-devServer"), i + 1 < args.count, let url = URL(string: args[i + 1]) {
				var dev = config
				dev.baseURL = url
				let auth = AuthSession(config: dev, signedInAs: devClaims)
				return AppModel(config: dev, auth: auth, api: LiveWardrobeAPI(baseURL: url, tokens: auth.tokens), storageRoot: storage.appending(path: "dev"))
			}
		#endif
		let auth = AuthSession(config: config, presenter: WebAuthenticationPresenter())
		return AppModel(config: config, auth: auth, api: LiveWardrobeAPI(baseURL: config.baseURL, tokens: auth.tokens), storageRoot: storage)
	}

	static let devClaims = AuthClaims(sub: "dev", email: "dev@localhost", preferredUsername: "dev", groups: ["wardrobe"], expiresAt: .distantFuture)

	/// Fixture-backed, signed in: SwiftUI previews and `-fixtures` runs.
	static func preview(api: FixtureWardrobeAPI = FixtureWardrobeAPI()) -> AppModel {
		let config = AppConfig(baseURL: URL(string: "https://wardrobe.vidur.xyz")!, issuer: URL(string: "https://z.vidur.xyz")!, clientID: "preview")
		let auth = AuthSession(config: config, signedInAs: devClaims)
		return AppModel(config: config, auth: auth, api: api, storageRoot: URL.temporaryDirectory.appending(path: "wardrobe-preview"))
	}
}
