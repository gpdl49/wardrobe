import Foundation
import Testing
@testable import Wardrobe
import WardrobeKit

@Suite struct ItemEditDiffTests {
	let encoder = JSONEncoder.wardrobe

	@Test func emptyDiffProducesNoChanges() throws {
		let initial = ItemFormData()
		let edited = ItemFormData()

		#expect(!ItemDiff.hasChanges(initial: initial, edited: edited))
		let patch = ItemDiff.diff(initial: initial, edited: edited)

		#expect(patch.name.isUnset)
		#expect(patch.brand.isUnset)
		#expect(patch.size.isUnset)
		#expect(patch.pattern.isUnset)
		#expect(patch.material.isUnset)
		#expect(patch.notes.isUnset)
		#expect(patch.categoryId.isUnset)
		#expect(patch.locationId.isUnset)
		#expect(patch.status == nil)
		#expect(patch.seasons == nil)
		#expect(patch.tags == nil)
		#expect(patch.colors == nil)

		let data = try encoder.encode(patch)
		let json = String(decoding: data, as: UTF8.self)
		#expect(json == "{}")
	}

	@Test func textUpdatesAndClears() throws {
		var initial = ItemFormData()
		initial.name = "Old Cardigan"
		initial.brand = "Old Brand"
		initial.size = "M"

		var edited = initial
		edited.name = "New Cardigan"
		edited.brand = "   " // Cleared
		// size unchanged

		#expect(ItemDiff.hasChanges(initial: initial, edited: edited))
		let patch = ItemDiff.diff(initial: initial, edited: edited)

		#expect(patch.name == .value("New Cardigan"))
		#expect(patch.brand == .null)
		#expect(patch.size.isUnset)

		let data = try encoder.encode(patch)
		let jsonObject = try JSONSerialization.jsonObject(with: data) as? [String: Any]

		#expect(jsonObject?["name"] as? String == "New Cardigan")
		#expect(jsonObject?["brand"] is NSNull)
		#expect(jsonObject?["size"] == nil)
	}

	@Test func idUpdatesAndClears() throws {
		var initial = ItemFormData()
		initial.categoryId = "cat-1"
		initial.locationId = "loc-1"

		var edited = initial
		edited.categoryId = "cat-2"
		edited.locationId = nil // Cleared

		let patch = ItemDiff.diff(initial: initial, edited: edited)

		#expect(patch.categoryId == .value("cat-2"))
		#expect(patch.locationId == .null)

		let data = try encoder.encode(patch)
		let jsonObject = try JSONSerialization.jsonObject(with: data) as? [String: Any]

		#expect(jsonObject?["categoryId"] as? String == "cat-2")
		#expect(jsonObject?["locationId"] is NSNull)
	}

	@Test func statusSeasonsTagsColorsDiffing() throws {
		var initial = ItemFormData()
		initial.status = .active
		initial.seasons = [.spring]
		initial.tags = ["cotton"]
		initial.colors = [ItemColor(name: "blue", hex: "#0000ff", share: 0.9)]

		var edited = initial
		edited.status = .stored
		edited.seasons = [.autumn, .winter]
		edited.tags = ["wool", "warm"]
		edited.colors = [ItemColor(name: "navy", hex: "#1f2a44", share: 0.95)]

		let patch = ItemDiff.diff(initial: initial, edited: edited)

		#expect(patch.status == .stored)
		#expect(patch.seasons == [.autumn, .winter])
		#expect(patch.tags == ["wool", "warm"])
		#expect(patch.colors?.first?.name == "navy")

		let data = try encoder.encode(patch)
		let jsonObject = try JSONSerialization.jsonObject(with: data) as? [String: Any]

		#expect(jsonObject?["status"] as? String == "stored")
		#expect((jsonObject?["seasons"] as? [String])?.sorted() == ["autumn", "winter"])
		#expect(jsonObject?["tags"] as? [String] == ["wool", "warm"])
	}
}
