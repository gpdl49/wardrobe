import Foundation
import Testing
import WardrobeKitTesting

@testable import WardrobeKit

@Suite struct OutfitsTests {
	@Test func oldAndNewMeDecode() throws {
		let old = #"{"id":"u","sub":"s","email":null,"username":null,"groups":[],"isAdmin":false}"#
		let new =
			#"{"id":"u","sub":"s","email":null,"username":null,"groups":[],"isAdmin":false,"features":{"vision":true,"suggestions":false,"immich":true}}"#
		#expect(try JSONDecoder.wardrobe.decode(MeDTO.self, from: Data(old.utf8)).features == nil)
		#expect(try JSONDecoder.wardrobe.decode(MeDTO.self, from: Data(new.utf8)).features?.immich == true)
	}
	@Test func requestEncodingAndQueries() throws {
		let body = UpdateOutfitRequest(notes: .null, itemIds: ["a", "b"])
		let json = String(decoding: try JSONEncoder.wardrobe.encode(body), as: UTF8.self)
		#expect(json.contains(#""notes":null"#))
		#expect(json.contains(#""itemIds":["a","b"]"#))
		#expect(OutfitQuery(season: .winter, limit: 10).queryItems.map(\.value) == ["winter", "10"])
		#expect(PhotoKind.outfit.isKnown)
	}
	@Test func fixtureLifecycle() async throws {
		let api = FixtureWardrobeAPI()
		#expect(try await api.outfits(OutfitQuery()).outfits.count == 1)
		let asset = try #require(await api.immichAssets(ImmichAssetQuery()).assets.first)
		let outfit = try await api.createOutfit(CreateOutfitRequest(name: "Test"), idempotencyKey: "one")
		let again = try await api.createOutfit(CreateOutfitRequest(name: "Test"), idempotencyKey: "one")
		#expect(outfit.id == again.id)
		let first = try await api.linkImmichAssets(
			outfitId: outfit.id, LinkImmichAssetsRequest(assetIds: [asset.id]))
		let second = try await api.linkImmichAssets(
			outfitId: outfit.id, LinkImmichAssetsRequest(assetIds: [asset.id]))
		#expect(first == second)
		#expect(try await api.immichThumbnail(assetId: asset.id) != nil)
		#expect(
			try await api.outfitImmichImage(outfitId: outfit.id, linkId: first[0].id, variant: .thumb)
				!= nil)
		let upload = try await api.createPhoto(
			CreatePhotoRequest(outfitId: outfit.id, kind: .outfit, size: 3), idempotencyKey: "photo")
		#expect(upload.photo.outfitId == outfit.id)
		_ = try await api.completePhoto(id: upload.photo.id)
		#expect(try await api.outfit(id: outfit.id).photos.contains { $0.id == upload.photo.id })
		try await api.deletePhoto(id: upload.photo.id)
		#expect(try await !api.outfit(id: outfit.id).photos.contains { $0.id == upload.photo.id })
		let run = try #require(await api.suggestionRuns(owner: nil).first)
		let suggestion = try #require(run.suggestions.first)
		#expect(try await api.dismissSuggestion(id: suggestion.id).feedback == .dismissed)
	}
}
