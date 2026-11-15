import Foundation
import Testing
import WardrobeKit
@testable import Wardrobe

@Suite struct LocationTreeTests {
	let now = Date(timeIntervalSince1970: 1_763_200_000)

	@Test func emptyListReturnsEmptyForest() {
		let tree = buildLocationTree(from: [])
		#expect(tree.isEmpty)
	}

	@Test func rootsOnlyReturnsSortedNodes() {
		let l1 = LocationDTO(id: "1", ownerId: "u", access: .owner, kind: .bag, code: "B-10", name: "B10", createdAt: now, updatedAt: now, itemCount: 2)
		let l2 = LocationDTO(id: "2", ownerId: "u", access: .owner, kind: .bag, code: "B-02", name: "B02", createdAt: now, updatedAt: now, itemCount: 3)
		let l3 = LocationDTO(id: "3", ownerId: "u", access: .owner, kind: .bag, code: "B-01", name: "B01", createdAt: now, updatedAt: now, itemCount: 1)

		let tree = buildLocationTree(from: [l1, l2, l3])

		#expect(tree.count == 3)
		#expect(tree.map(\.location.code) == ["B-01", "B-02", "B-10"])
		#expect(tree[0].children == nil)
	}

	@Test func nestedHierarchyBuildsCorrectly() {
		let closet = LocationDTO(id: "closet", ownerId: "u", access: .owner, kind: .closet, code: "CL-BEDROOM", name: "Closet", createdAt: now, updatedAt: now, itemCount: 10)
		let shelf = LocationDTO(id: "shelf", ownerId: "u", access: .owner, kind: .other, code: "CL-SHELF", name: "Top shelf", parentId: "closet", createdAt: now, updatedAt: now, itemCount: 5)
		let bag = LocationDTO(id: "bag", ownerId: "u", access: .owner, kind: .bag, code: "B-01", name: "Knits", parentId: "shelf", createdAt: now, updatedAt: now, itemCount: 3)

		let tree = buildLocationTree(from: [bag, closet, shelf])

		#expect(tree.count == 1)
		#expect(tree[0].location.code == "CL-BEDROOM")
		#expect(tree[0].children?.count == 1)

		let shelfNode = tree[0].children![0]
		#expect(shelfNode.location.code == "CL-SHELF")
		#expect(shelfNode.children?.count == 1)

		let bagNode = shelfNode.children![0]
		#expect(bagNode.location.code == "B-01")
		#expect(bagNode.children == nil)

		// Recursive item count
		#expect(tree[0].totalItemCount == 18)
		#expect(shelfNode.totalItemCount == 8)
		#expect(bagNode.totalItemCount == 3)
	}

	@Test func orphanedParentTreatedAsRoot() {
		let bag = LocationDTO(id: "bag", ownerId: "u", access: .owner, kind: .bag, code: "B-01", name: "Knits", parentId: "nonexistent", createdAt: now, updatedAt: now, itemCount: 2)

		let tree = buildLocationTree(from: [bag])

		#expect(tree.count == 1)
		#expect(tree[0].location.code == "B-01")
	}

	@Test func cyclicParentDoesNotInfiniteLoop() {
		let a = LocationDTO(id: "a", ownerId: "u", access: .owner, kind: .other, code: "A", name: "A", parentId: "b", createdAt: now, updatedAt: now, itemCount: 0)
		let b = LocationDTO(id: "b", ownerId: "u", access: .owner, kind: .other, code: "B", name: "B", parentId: "a", createdAt: now, updatedAt: now, itemCount: 0)

		// When both point to each other, neither has parentId == nil, but cycle is safely handled
		let tree = buildLocationTree(from: [a, b])
		#expect(tree.count <= 2)
	}
}
