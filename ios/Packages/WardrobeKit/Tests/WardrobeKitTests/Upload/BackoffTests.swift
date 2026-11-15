import Testing
@testable import WardrobeKit

@Suite("BackoffTests")
struct BackoffTests {
	@Test func exponentialBackoffMatchesContractWithMaxRandom() {
		#expect(backoffDelay(attempt: 1, random: { 1.0 }) == 1.0)
		#expect(backoffDelay(attempt: 2, random: { 1.0 }) == 2.0)
		#expect(backoffDelay(attempt: 4, random: { 1.0 }) == 8.0)
	}

	@Test func jitterUsesHalfScaleAtMinRandom() {
		// random = 0 → jitter factor 0.5
		#expect(backoffDelay(attempt: 3, random: { 0.0 }) == 2.0)
	}

	@Test func capsAtSixtySeconds() {
		#expect(backoffDelay(attempt: 20, random: { 1.0 }) == 60.0)
	}
}
