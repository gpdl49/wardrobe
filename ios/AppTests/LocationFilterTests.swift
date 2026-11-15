import Foundation
import Testing
import WardrobeKit
@testable import Wardrobe

@Suite struct LocationFilterTests {
	@Test func defaultFilterBuildsEmptyQuery() {
		let filter = LocationsFilter()
		let query = filter.makeQuery()

		#expect(query.owner == nil)
		#expect(query.kind == nil)
		#expect(query.q == nil)
		#expect(query.archived == nil)
		#expect(query.queryItems.isEmpty)
	}

	@Test func ownerFilterBuildsQuery() {
		let filter = LocationsFilter(owner: "owner-123")
		let query = filter.makeQuery()

		#expect(query.owner == "owner-123")
		#expect(query.queryItems.contains(URLQueryItem(name: "owner", value: "owner-123")))
	}

	@Test func kindFilterBuildsQuery() {
		let filter = LocationsFilter(kind: .bag)
		let query = filter.makeQuery()

		#expect(query.kind == .bag)
		#expect(query.queryItems.contains(URLQueryItem(name: "kind", value: "bag")))
	}

	@Test func searchFilterTrimsWhitespaceAndIgnoresEmpty() {
		let emptyFilter = LocationsFilter(q: "   ")
		#expect(emptyFilter.makeQuery().q == nil)

		let filter = LocationsFilter(q: "  winter knits  ")
		let query = filter.makeQuery()
		#expect(query.q == "winter knits")
		#expect(query.queryItems.contains(URLQueryItem(name: "q", value: "winter knits")))
	}

	@Test func archivedFilterSetsFlag() {
		let filterFalse = LocationsFilter(archived: false)
		#expect(filterFalse.makeQuery().archived == nil)

		let filterTrue = LocationsFilter(archived: true)
		let query = filterTrue.makeQuery()
		#expect(query.archived == true)
		#expect(query.queryItems.contains(URLQueryItem(name: "archived", value: "true")))
	}

	@Test func combinedFilterBuildsFullQuery() {
		let filter = LocationsFilter(owner: "u1", kind: .suitcase, q: "carry-on", archived: true)
		let query = filter.makeQuery()

		#expect(query.owner == "u1")
		#expect(query.kind == .suitcase)
		#expect(query.q == "carry-on")
		#expect(query.archived == true)
		#expect(query.queryItems.count == 4)
	}
}
