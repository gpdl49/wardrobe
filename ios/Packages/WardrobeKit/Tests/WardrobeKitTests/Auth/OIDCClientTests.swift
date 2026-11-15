import Foundation
import Testing
@testable import WardrobeKit

@Suite struct OIDCClientTests {
	@Test func decodesTokenResponseJSON() throws {
		let jwt = makeTestJWT()
		let json = """
		{
			"id_token": "\(jwt)",
			"refresh_token": "rt_abc",
			"access_token": "at_unused",
			"token_type": "Bearer",
			"expires_in": 3600
		}
		"""
		let decoded = try JSONDecoder().decode(OIDCTokenResponse.self, from: Data(json.utf8))
		#expect(decoded.idToken == jwt)
		#expect(decoded.refreshToken == "rt_abc")
		#expect(decoded.accessToken == "at_unused")
		#expect(decoded.tokenType == "Bearer")
		#expect(decoded.expiresIn == 3600)
	}

	@Test func decodesOAuthErrorResponse() throws {
		let json = """
		{"error":"invalid_grant","error_description":"Refresh token expired"}
		"""
		let decoded = try JSONDecoder().decode(OIDCErrorResponse.self, from: Data(json.utf8))
		#expect(decoded.error == "invalid_grant")
		#expect(decoded.errorDescription == "Refresh token expired")
	}
}
