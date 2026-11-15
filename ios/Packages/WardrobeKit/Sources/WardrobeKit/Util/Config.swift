import Foundation

/// Build-time configuration read from Info.plist (set from build settings in
/// ios/project.yml; see docs/ios/api-contract.md "Names").
public struct AppConfig: Sendable, Hashable {
	public var baseURL: URL
	public var issuer: URL
	public var clientID: String
	public var redirectURI: URL
	public var postLogoutRedirectURI: URL
	public var scopes: [String]

	public init(
		baseURL: URL, issuer: URL, clientID: String,
		redirectURI: URL = URL(string: "xyz.vidur.wardrobe://oauth/callback")!,
		postLogoutRedirectURI: URL = URL(string: "xyz.vidur.wardrobe://oauth/logout")!,
		scopes: [String] = ["openid", "email", "profile", "offline_access"]
	) {
		self.baseURL = baseURL; self.issuer = issuer; self.clientID = clientID
		self.redirectURI = redirectURI; self.postLogoutRedirectURI = postLogoutRedirectURI
		self.scopes = scopes
	}

	/// The URL scheme of `redirectURI`.
	public var callbackScheme: String { redirectURI.scheme ?? "xyz.vidur.wardrobe" }

	/// Reads `WardrobeBaseURL`, `WardrobeOIDCIssuer`, `WardrobeOIDCClientID`.
	public static func fromBundle(_ bundle: Bundle = .main) -> AppConfig {
		func value(_ key: String, _ fallback: String) -> String {
			let v = bundle.object(forInfoDictionaryKey: key) as? String ?? ""
			return v.isEmpty ? fallback : v
		}
		return AppConfig(
			baseURL: URL(string: value("WardrobeBaseURL", "https://wardrobe.vidur.xyz"))!,
			issuer: URL(string: value("WardrobeOIDCIssuer", "https://z.vidur.xyz"))!,
			clientID: value("WardrobeOIDCClientID", ""))
	}
}
