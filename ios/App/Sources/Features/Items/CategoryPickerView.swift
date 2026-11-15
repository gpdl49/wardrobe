import SwiftUI
import WardrobeKit

/// Helper to build category tree and display paths.
public enum CategoryTreeHelper {
	public struct CategoryItem: Identifiable, Sendable {
		public let category: CategoryDTO
		public let depth: Int
		public let path: String

		public var id: ID { category.id }
		public var name: String { category.name }
	}

	/// Returns flattened tree with depth and breadcrumb path.
	public static func flattenedTree(from categories: [CategoryDTO]) -> [CategoryItem] {
		var byParent: [ID?: [CategoryDTO]] = [:]
		for c in categories {
			byParent[c.parentId, default: []].append(c)
		}
		for key in byParent.keys {
			byParent[key]?.sort { $0.sortOrder < $1.sortOrder || ($0.sortOrder == $1.sortOrder && $0.name < $1.name) }
		}

		var result: [CategoryItem] = []
		func visit(parentId: ID?, depth: Int, parentPath: String) {
			guard let children = byParent[parentId] else { return }
			for child in children {
				let path = parentPath.isEmpty ? child.name : "\(parentPath) > \(child.name)"
				result.append(CategoryItem(category: child, depth: depth, path: path))
				visit(parentId: child.id, depth: depth + 1, parentPath: path)
			}
		}

		visit(parentId: nil, depth: 0, parentPath: "")
		return result
	}

	/// Formats breadcrumb path for a category id.
	public static func path(for id: ID?, in categories: [CategoryDTO]) -> String? {
		guard let id else { return nil }
		var current = categories.first(where: { $0.id == id })
		guard let found = current else { return nil }
		var names = [found.name]
		while let pid = current?.parentId, let parent = categories.first(where: { $0.id == pid }) {
			names.insert(parent.name, at: 0)
			current = parent
		}
		return names.joined(separator: " > ")
	}
}

/// Category picker presenting categories hierarchically.
struct CategoryPickerView: View {
	@Binding var selection: ID?
	let categories: [CategoryDTO]

	var tree: [CategoryTreeHelper.CategoryItem] {
		CategoryTreeHelper.flattenedTree(from: categories)
	}

	var body: some View {
		Picker("Category", selection: $selection) {
			Text("None").tag(ID?.none)
			ForEach(tree) { item in
				Text(String(repeating: "  ", count: item.depth) + item.name)
					.tag(ID?.some(item.id))
			}
		}
	}
}
