import Foundation
import Testing
@testable import WardrobeKit

@Suite struct ModelsTests {
	@Test func decodesItemWithUnknownEnumAndBothDateForms() throws {
		let json = """
			{"id":"i1","ownerId":"u1","access":"owner","name":null,"category":null,"brand":null,
			 "size":null,"colors":[],"pattern":null,"material":null,"seasons":["winter","monsoon"],
			 "status":"archived","location":null,"notes":null,"tags":[],"coverPhoto":null,
			 "createdAt":"2026-11-15T08:00:00.123Z","updatedAt":"2026-11-15T08:00:00Z","extra":1}
			"""
		let item = try JSONDecoder.wardrobe.decode(ItemSummaryDTO.self, from: Data(json.utf8))
		#expect(item.seasons == [.winter, Season(rawValue: "monsoon")])
		#expect(!item.status.isKnown)
		#expect(item.createdAt.timeIntervalSince1970.truncatingRemainder(dividingBy: 1) > 0.1)
	}

	@Test func patchEncodesUnsetNullAndValue() throws {
		var body = UpdateItemRequest()
		body.name = .value("Coat")
		body.locationId = .null
		let json = String(decoding: try JSONEncoder.wardrobe.encode(body), as: UTF8.self)
		#expect(json == #"{"locationId":null,"name":"Coat"}"#)
	}

	@Test func moveSendsNullDestination() throws {
		let json = String(decoding: try JSONEncoder.wardrobe.encode(MoveItemsRequest(itemIds: ["a"], toLocationId: nil)), as: UTF8.self)
		#expect(json == #"{"itemIds":["a"],"toLocationId":null}"#)
	}

	@Test func bulkApplyOmitsUnsetFieldsAndSendsChosenOnes() throws {
		let encode = { (body: BulkApplyRequest) in String(decoding: try JSONEncoder.wardrobe.encode(body), as: UTF8.self) }
		// No fields: the server applies tags only, as older clients expect.
		#expect(try encode(BulkApplyRequest()) == "{}")
		let json = try encode(BulkApplyRequest(ownerId: "u", fields: BulkApplyField.allCases))
		#expect(json.contains(#""fields":["tags","pattern","material","seasons"]"#))
		#expect(json.contains(#""ownerId":"u""#))
	}

	@Test func queryItemsSkipEmpty() {
		let q = ItemQuery(owner: "u", season: .winter, q: "", limit: 20)
		#expect(q.queryItems.map(\.name) == ["owner", "season", "limit"])
	}

	@Test(arguments: [("b-07", "B-07"), (" cl-bedroom ", "CL-BEDROOM"), ("-x", nil), ("", nil), ("a b", nil)])
	func locationCodes(raw: String, expected: String?) {
		#expect(normalizeLocationCode(raw) == expected)
	}
}
