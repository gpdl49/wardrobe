import Foundation
import Testing
import WardrobeKit
import WardrobeKitTesting
@testable import Wardrobe

@MainActor
@Suite struct LocationResolverTests {
	let myId = FixtureWardrobeAPI.meID
	let otherId = FixtureWardrobeAPI.friendID

	@Test func resolvesExistingLocation() async {
		let api = FixtureWardrobeAPI()
		let model = LocationCodeResolverModel(
			api: api,
			ownerId: myId,
			code: "CL-BEDROOM",
			myId: myId
		)

		await model.resolve()

		if case .resolved(let location) = model.state {
			#expect(location.code == "CL-BEDROOM")
			#expect(location.ownerId == myId)
		} else {
			Issue.record("Expected resolved state, got \(model.state)")
		}
	}

	@Test func notFoundOwnWardrobeAllowsCreation() async {
		let api = FixtureWardrobeAPI()
		let model = LocationCodeResolverModel(
			api: api,
			ownerId: myId,
			code: "UNKNOWN-CODE",
			myId: myId
		)

		await model.resolve()

		#expect(model.state == .notFound(canCreate: true))
	}

	@Test func notFoundOtherWardrobeDisallowsCreation() async {
		let api = FixtureWardrobeAPI()
		let model = LocationCodeResolverModel(
			api: api,
			ownerId: otherId,
			code: "UNKNOWN-CODE",
			myId: myId
		)

		await model.resolve()

		#expect(model.state == .notFound(canCreate: false))
	}

	@Test func networkErrorSurfacesAsErrorState() async {
		let api = FixtureWardrobeAPI()
		await api.setNextError(APIError(status: 500, error: "server_error", message: "Failed"))
		let model = LocationCodeResolverModel(
			api: api,
			ownerId: myId,
			code: "CL-BEDROOM",
			myId: myId
		)

		await model.resolve()

		if case .error(let msg) = model.state {
			#expect(!msg.isEmpty)
		} else {
			Issue.record("Expected error state, got \(model.state)")
		}
	}
}
