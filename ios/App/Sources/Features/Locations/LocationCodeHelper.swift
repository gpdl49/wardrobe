import Foundation
import WardrobeKit

// MARK: - Code Prefixes & Kinds

/// Default code prefix for containers.
public func codePrefix(for kind: LocationKind) -> String {
	switch kind {
	case .bag: "B"
	case .vacuumBag: "V"
	case .suitcase: "S"
	case .closet: "CL"
	case .drawer: "DR"
	default: "LOC"
	}
}

/// Infers the location kind from a code's prefix (e.g. `B-12` -> `.bag`).
public func kindForCode(_ code: String) -> LocationKind {
	let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
	guard let dashIndex = trimmed.firstIndex(of: "-") else {
		return .other
	}
	let prefix = String(trimmed[..<dashIndex])
	switch prefix {
	case "B": return .bag
	case "V": return .vacuumBag
	case "S": return .suitcase
	case "CL": return .closet
	case "D", "DR": return .drawer
	default: return .other
	}
}

/// Generates the next free numbered code for a kind (e.g. `B-08` after `B-07`).
/// Never reuses gaps so retired labels are not reused.
public func nextFreeCode(from codes: [String], kind: LocationKind) -> String {
	let prefix = codePrefix(for: kind)
	let prefixPattern = "\(prefix)-"
	var maxNumber = 0
	var taken = Set<String>()

	for rawCode in codes {
		let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
		taken.insert(code)
		if code.hasPrefix(prefixPattern) {
			let suffix = String(code.dropFirst(prefixPattern.count))
			if let num = Int(suffix), num > maxNumber {
				maxNumber = num
			}
		}
	}

	var next = maxNumber + 1
	var candidate = String(format: "%@-%02d", prefix, next)
	while taken.contains(candidate) {
		next += 1
		candidate = String(format: "%@-%02d", prefix, next)
	}
	return candidate
}

/// Default display name for a new numbered container (e.g. "Vacuum bag V-08").
public func defaultName(kind: LocationKind, code: String) -> String {
	"\(kind.label) \(code)"
}

// MARK: - Subtree Helpers

/// Returns the ID of `id` and every location nested under it to prevent cyclic parent assignments.
public func subtreeIds(locations: [LocationDTO], id: ID) -> Set<ID> {
	var ids: Set<ID> = [id]
	var grew = true
	while grew {
		grew = false
		for loc in locations {
			if let parentId = loc.parentId, ids.contains(parentId), !ids.contains(loc.id) {
				ids.insert(loc.id)
				grew = true
			}
		}
	}
	return ids
}
