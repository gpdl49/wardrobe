import Foundation
import WardrobeKit

/// Form state for editing an item.
public struct ItemFormData: Equatable, Sendable {
	public var name: String = ""
	public var categoryId: ID? = nil
	public var brand: String = ""
	public var size: String = ""
	public var colors: [ItemColor] = []
	public var pattern: String = ""
	public var material: String = ""
	public var seasons: [Season] = []
	public var status: ItemStatus = .active
	public var locationId: ID? = nil
	public var notes: String = ""
	public var tags: [String] = []

	public init() {}

	public init(item: ItemDetailDTO) {
		self.name = item.name ?? ""
		self.categoryId = item.category?.id
		self.brand = item.brand ?? ""
		self.size = item.size ?? ""
		self.colors = item.colors
		self.pattern = item.pattern ?? ""
		self.material = item.material ?? ""
		self.seasons = item.seasons
		self.status = item.status
		self.locationId = item.location?.id
		self.notes = item.notes ?? ""
		self.tags = item.tags
	}
}

/// Diffing logic between initial state and edited state for PATCH /api/items/{id}.
public enum ItemDiff {
	/// Only changed fields are set in the UpdateItemRequest; blank strings become .null.
	public static func diff(initial: ItemFormData, edited: ItemFormData) -> UpdateItemRequest {
		var request = UpdateItemRequest()

		request.name = diffString(initial: initial.name, edited: edited.name)
		request.brand = diffString(initial: initial.brand, edited: edited.brand)
		request.size = diffString(initial: initial.size, edited: edited.size)
		request.pattern = diffString(initial: initial.pattern, edited: edited.pattern)
		request.material = diffString(initial: initial.material, edited: edited.material)
		request.notes = diffString(initial: initial.notes, edited: edited.notes)

		request.categoryId = diffID(initial: initial.categoryId, edited: edited.categoryId)
		request.locationId = diffID(initial: initial.locationId, edited: edited.locationId)

		if initial.status != edited.status {
			request.status = edited.status
		}

		if initial.seasons != edited.seasons {
			request.seasons = Season.known.filter { edited.seasons.contains($0) }
		}

		if initial.tags != edited.tags {
			request.tags = edited.tags
		}

		if initial.colors != edited.colors {
			request.colors = edited.colors
		}

		return request
	}

	public static func hasChanges(initial: ItemFormData, edited: ItemFormData) -> Bool {
		let req = diff(initial: initial, edited: edited)
		return !req.name.isUnset ||
			!req.brand.isUnset ||
			!req.size.isUnset ||
			!req.pattern.isUnset ||
			!req.material.isUnset ||
			!req.notes.isUnset ||
			!req.categoryId.isUnset ||
			!req.locationId.isUnset ||
			req.status != nil ||
			req.seasons != nil ||
			req.tags != nil ||
			req.colors != nil
	}

	private static func diffString(initial: String, edited: String) -> Patch<String> {
		let trimmedInitial = initial.trimmingCharacters(in: .whitespacesAndNewlines)
		let trimmedEdited = edited.trimmingCharacters(in: .whitespacesAndNewlines)
		if trimmedInitial == trimmedEdited {
			return .unset
		}
		if trimmedEdited.isEmpty {
			return .null
		}
		return .value(trimmedEdited)
	}

	private static func diffID(initial: ID?, edited: ID?) -> Patch<ID> {
		let normInitial = (initial?.isEmpty == false) ? initial : nil
		let normEdited = (edited?.isEmpty == false) ? edited : nil
		if normInitial == normEdited {
			return .unset
		}
		if let normEdited {
			return .value(normEdited)
		}
		return .null
	}
}
