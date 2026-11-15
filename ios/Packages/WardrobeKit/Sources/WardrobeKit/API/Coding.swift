import Foundation

extension JSONDecoder {
	/// Decodes API JSON: ISO 8601 dates with or without fractional seconds.
	public static var wardrobe: JSONDecoder {
		let d = JSONDecoder()
		d.dateDecodingStrategy = .custom { decoder in
			let s = try decoder.singleValueContainer().decode(String.self)
			if let date = ISO8601.parse(s) { return date }
			throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(s)"))
		}
		return d
	}
}

extension JSONEncoder {
	/// Encodes API JSON: ISO 8601 dates with milliseconds, sorted keys (so a
	/// body is byte-identical on every retry).
	public static var wardrobe: JSONEncoder {
		let e = JSONEncoder()
		e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
		e.dateEncodingStrategy = .custom { date, encoder in
			var c = encoder.singleValueContainer()
			try c.encode(ISO8601.format(date))
		}
		return e
	}
}

public enum ISO8601 {
	public static func parse(_ s: String) -> Date? {
		if let d = try? Date(s, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return d }
		return try? Date(s, strategy: Date.ISO8601FormatStyle())
	}
	public static func format(_ date: Date) -> String {
		date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
	}
}
