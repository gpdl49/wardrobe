import Foundation
import WardrobeKit

/// A category with hierarchy and display path metadata.
struct CategoryNode: Identifiable, Hashable, Sendable {
	let category: CategoryDTO
	let depth: Int
	let path: String
	let children: [CategoryNode]

	var id: ID { category.id }
	var name: String { category.name }
	var slug: String { category.slug }
}

enum CategoryTree {
	/// Builds the category tree from the flat list (GET /api/categories).
	static func buildTree(from categories: [CategoryDTO]) -> [CategoryNode] {
		let ids = Set(categories.map(\.id))
		var childrenOf: [ID?: [CategoryDTO]] = [:]

		for category in categories {
			let parent = (category.parentId != nil && ids.contains(category.parentId!)) ? category.parentId : nil
			childrenOf[parent, default: []].append(category)
		}

		func visit(parentId: ID?, depth: Int, prefix: String, seen: Set<ID>) -> [CategoryNode] {
			let children = (childrenOf[parentId] ?? []).filter { !seen.contains($0.id) }
				.sorted {
					if $0.sortOrder != $1.sortOrder {
						return $0.sortOrder < $1.sortOrder
					}
					return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
				}

			return children.map { cat in
				let path = prefix.isEmpty ? cat.name : "\(prefix) › \(cat.name)"
				var nextSeen = seen
				nextSeen.insert(cat.id)
				let subChildren = visit(parentId: cat.id, depth: depth + 1, prefix: path, seen: nextSeen)
				return CategoryNode(category: cat, depth: depth, path: path, children: subChildren)
			}
		}

		return visit(parentId: nil, depth: 0, prefix: "", seen: Set())
	}

	/// Returns a depth-first list for hierarchical pickers.
	static func flatten(nodes: [CategoryNode]) -> [CategoryNode] {
		nodes.flatMap { [$0] + flatten(nodes: $0.children) }
	}
}
