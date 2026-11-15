import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit

@MainActor
@Suite struct SignInTests {
	@Test func unconfiguredClientIDIsDetected() {
		let unconfigured = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: "   "
		)
		let auth = AuthSession(config: unconfigured, signedInAs: AppModel.devClaims)
		let vm = SignInModel(auth: auth)

		#expect(!vm.isConfigured)
	}

	@Test func configuredClientIDIsDetected() {
		let configured = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: "wardrobe-ios"
		)
		let auth = AuthSession(config: configured, signedInAs: AppModel.devClaims)
		let vm = SignInModel(auth: auth)

		#expect(vm.isConfigured)
	}

	@Test func signInWhenConfiguredTriggersAuth() async {
		let configured = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: "wardrobe-ios"
		)
		let auth = AuthSession(config: configured, signedInAs: AppModel.devClaims)
		let vm = SignInModel(auth: auth)

		await vm.signIn()
		#expect(!vm.isSigningIn)
	}

	@Test func signInWhenUnconfiguredDoesNothing() async {
		let unconfigured = AppConfig(
			baseURL: URL(string: "https://wardrobe.vidur.xyz")!,
			issuer: URL(string: "https://z.vidur.xyz")!,
			clientID: ""
		)
		let auth = AuthSession(config: unconfigured, signedInAs: AppModel.devClaims)
		let vm = SignInModel(auth: auth)

		await vm.signIn()
		#expect(!vm.isSigningIn)
	}
}
