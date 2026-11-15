import Foundation

struct RunAnalysesRequest: Encodable, Sendable {
	let kinds: [AnalysisKind]?

	enum CodingKeys: String, CodingKey {
		case kinds
	}

	func encode(to encoder: any Encoder) throws {
		var container = encoder.container(keyedBy: CodingKeys.self)
		try container.encodeIfPresent(kinds, forKey: .kinds)
	}
}

struct ApplyAnalysisRequest: Encodable, Sendable {
	let fields: [ItemSuggestion.Field]
}

struct UpdateShareRequest: Encodable, Sendable {
	let access: ShareAccess
}
