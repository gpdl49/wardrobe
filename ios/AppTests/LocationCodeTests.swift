import Foundation
import Testing
import WardrobeKit
@testable import Wardrobe

@Suite struct LocationCodeTests {
	let now = Date(timeIntervalSince1970: 1_763_200_000)

	@Test func normalizeLocationCodeAcceptsValid() {
		#expect(normalizeLocationCode("B-07") == "B-07")
		#expect(normalizeLocationCode("  b-07  ") == "B-07")
		#expect(normalizeLocationCode("cl-bedroom") == "CL-BEDROOM")
		#expect(normalizeLocationCode("S-1") == "S-1")
		#expect(normalizeLocationCode("DRAWER-TOP-1") == "DRAWER-TOP-1")
	}

	@Test func normalizeLocationCodeRejectsInvalid() {
		#expect(normalizeLocationCode("") == nil)
		#expect(normalizeLocationCode("   ") == nil)
		#expect(normalizeLocationCode("-leading-hyphen") == nil)
		#expect(normalizeLocationCode("has spaces") == nil)
		#expect(normalizeLocationCode("invalid@symbol") == nil)
		// More than 32 characters
		let longCode = String(repeating: "A", count: 33)
		#expect(normalizeLocationCode(longCode) == nil)
	}

	@Test func kindForCodeInfersCorrectKind() {
		#expect(kindForCode("B-01") == .bag)
		#expect(kindForCode("b-12") == .bag)
		#expect(kindForCode("S-04") == .suitcase)
		#expect(kindForCode("CL-BEDROOM") == .closet)
		#expect(kindForCode("D-01") == .drawer)
		#expect(kindForCode("DR-02") == .drawer)
		#expect(kindForCode("SHELF-TOP") == .other)
		#expect(kindForCode("NO_DASH") == .other)
	}

	@Test func nextFreeCodeHandlesEmptyAndSequential() {
		#expect(nextFreeCode(from: [], kind: .bag) == "B-01")
		#expect(nextFreeCode(from: ["B-01", "B-02"], kind: .bag) == "B-03")
		#expect(nextFreeCode(from: ["S-01"], kind: .suitcase) == "S-02")
	}

	@Test func nextFreeCodeNeverReusesGaps() {
		// Retired B-07 should not cause B-02 to be chosen
		#expect(nextFreeCode(from: ["B-01", "B-07"], kind: .bag) == "B-08")
	}

	@Test func nextFreeCodeSkipsExistingCandidates() {
		// Even if max is 7, if candidate B-08 is somehow already taken, it moves to B-09
		#expect(nextFreeCode(from: ["B-07", "B-08"], kind: .bag) == "B-09")
	}

	@Test func defaultNameGeneratesCorrectDisplay() {
		#expect(defaultName(kind: .bag, code: "B-07") == "Vacuum bag B-07")
		#expect(defaultName(kind: .suitcase, code: "S-01") == "Suitcase S-01")
	}

	@Test func subtreeIdsFindsAllDescendants() {
		let l1 = LocationDTO(id: "1", ownerId: "u", access: .owner, kind: .closet, code: "CL-1", name: "C1", createdAt: now, updatedAt: now, itemCount: 0)
		let l2 = LocationDTO(id: "2", ownerId: "u", access: .owner, kind: .other, code: "SH-1", name: "S1", parentId: "1", createdAt: now, updatedAt: now, itemCount: 0)
		let l3 = LocationDTO(id: "3", ownerId: "u", access: .owner, kind: .bag, code: "B-1", name: "B1", parentId: "2", createdAt: now, updatedAt: now, itemCount: 0)
		let l4 = LocationDTO(id: "4", ownerId: "u", access: .owner, kind: .bag, code: "B-2", name: "B2", parentId: "1", createdAt: now, updatedAt: now, itemCount: 0)
		let other = LocationDTO(id: "other", ownerId: "u", access: .owner, kind: .suitcase, code: "S-1", name: "S1", createdAt: now, updatedAt: now, itemCount: 0)

		let descendants = subtreeIds(locations: [l1, l2, l3, l4, other], id: "1")
		#expect(descendants == ["1", "2", "3", "4"])
		#expect(!descendants.contains("other"))
	}
}
