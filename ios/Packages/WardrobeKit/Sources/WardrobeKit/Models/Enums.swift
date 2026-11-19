import Foundation

// String enums of the API (lib/api/types.ts). Each is an "open" enum: a
// RawRepresentable struct with the known values as static members, so a value
// the server adds later decodes instead of failing the whole response.

/// A string-backed value from the API with a fixed set of known values.
public protocol OpenEnum: RawRepresentable, Codable, Hashable, Sendable,
	CustomStringConvertible, ExpressibleByStringLiteral
where RawValue == String {
	init(rawValue: String)
	/// The values the app knows, in display order.
	static var known: [Self] { get }
}

extension OpenEnum {
	public init(stringLiteral value: String) { self.init(rawValue: value) }
	public var description: String { rawValue }
	/// False for a value this build doesn't know.
	public var isKnown: Bool { Self.known.contains(self) }

	public init(from decoder: any Decoder) throws {
		self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
	}

	public func encode(to encoder: any Encoder) throws {
		var c = encoder.singleValueContainer()
		try c.encode(rawValue)
	}
}

public struct LocationKind: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let bag: Self = "bag"
	public static let vacuumBag: Self = "vacuum_bag"
	public static let suitcase: Self = "suitcase"
	public static let closet: Self = "closet"
	public static let drawer: Self = "drawer"
	public static let other: Self = "other"
	public static let packContainers: [Self] = [.bag, .vacuumBag, .suitcase]
	public static let known: [Self] = [.bag, .vacuumBag, .suitcase, .closet, .drawer, .other]
}

public struct Season: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let spring: Self = "spring"
	public static let summer: Self = "summer"
	public static let autumn: Self = "autumn"
	public static let winter: Self = "winter"
	public static let known: [Self] = [.spring, .summer, .autumn, .winter]
}

public struct ItemStatus: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let active: Self = "active"
	public static let stored: Self = "stored"
	public static let lent: Self = "lent"
	public static let donated: Self = "donated"
	public static let discarded: Self = "discarded"
	public static let known: [Self] = [.active, .stored, .lent, .donated, .discarded]
}

public struct PhotoKind: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	/// The front of the garment.
	public static let main: Self = "main"
	/// The back of the garment.
	public static let back: Self = "back"
	public static let label: Self = "label"
	public static let detail: Self = "detail"
	public static let outfit: Self = "outfit"
	public static let known: [Self] = [.main, .back, .label, .detail, .outfit]

	/// Kinds a user can pick for an item photo, in display order.
	public static let itemKinds: [Self] = [.main, .back, .label, .detail]

	/// Whole-garment shots: the ones background removal works on.
	public var isGarment: Bool { self == .main || self == .back }

	/// User-facing name; `main` is shown as "Front".
	public var displayName: String {
		switch self {
		case .main: "Front"
		case .back: "Back"
		case .label: "Label"
		case .detail: "Detail"
		case .outfit: "Outfit"
		default: rawValue.capitalized
		}
	}
}

public struct PhotoStatus: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let pending: Self = "pending"
	public static let processing: Self = "processing"
	public static let ready: Self = "ready"
	public static let failed: Self = "failed"
	public static let known: [Self] = [.pending, .processing, .ready, .failed]
}

public struct PhotoBackgroundStatus: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let queued: Self = "queued"
	public static let ready: Self = "ready"
	public static let skipped: Self = "skipped"
	public static let failed: Self = "failed"
	public static let known: [Self] = [.queued, .ready, .skipped, .failed]
}

public struct PhotoVariant: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let original: Self = "original"
	public static let display: Self = "display"
	public static let thumb: Self = "thumb"
	public static let cutoutDisplay: Self = "cutout-display"
	public static let cutoutThumb: Self = "cutout-thumb"
	public static let known: [Self] = [.original, .display, .thumb, .cutoutDisplay, .cutoutThumb]
}

public struct SessionMode: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let pack: Self = "pack"
	public static let unpack: Self = "unpack"
	public static let known: [Self] = [.pack, .unpack]
}

public struct AnalysisKind: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let colors: Self = "colors"
	public static let vision: Self = "vision"
	public static let known: [Self] = [.colors, .vision]
}

public struct AnalysisStatus: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let queued: Self = "queued"
	public static let running: Self = "running"
	public static let done: Self = "done"
	public static let failed: Self = "failed"
	public static let known: [Self] = [.queued, .running, .done, .failed]
}

/// What a share grants.
public struct ShareAccess: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let view: Self = "view"
	public static let edit: Self = "edit"
	public static let known: [Self] = [.view, .edit]
}

/// What the caller may do with a row.
public struct Access: OpenEnum {
	public let rawValue: String
	public init(rawValue: String) { self.rawValue = rawValue }
	public static let owner: Self = "owner"
	public static let edit: Self = "edit"
	public static let view: Self = "view"
	public static let known: [Self] = [.owner, .edit, .view]
	/// Owner or edit share.
	public var canEdit: Bool { self == .owner || self == .edit }
}
