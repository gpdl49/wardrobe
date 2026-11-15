import Foundation

/// A request field that can be left out, sent as null, or sent with a value.
/// Encoded by the request types' `encode(to:)`: `.unset` writes nothing.
public enum Patch<Value: Encodable & Sendable & Hashable>: Sendable, Hashable {
	case unset
	case null
	case value(Value)

	public var isUnset: Bool { if case .unset = self { true } else { false } }
}

extension Patch: ExpressibleByNilLiteral {
	public init(nilLiteral: ()) { self = .null }
}

extension KeyedEncodingContainer {
	/// Writes `.value` and `.null`; skips `.unset`.
	public mutating func encode<V>(_ patch: Patch<V>, forKey key: Key) throws {
		switch patch {
		case .unset: break
		case .null: try encodeNil(forKey: key)
		case .value(let v): try encode(v, forKey: key)
		}
	}
}
