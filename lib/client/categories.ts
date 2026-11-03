import type { CategoryDto } from "@/lib/api/types";

export interface CategoryNode extends CategoryDto {
	depth: number;
	children: CategoryNode[];
	/** "Tops › Knitwear › Cardigan" */
	path: string;
}

const bySortOrder = (a: CategoryDto, b: CategoryDto) =>
	a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * Builds the category tree from the flat list (GET /api/categories). Orphans
 * (a parent that no longer exists) are treated as roots.
 */
export function buildCategoryTree(flat: CategoryDto[]): CategoryNode[] {
	const ids = new Set(flat.map((c) => c.id));
	const childrenOf = new Map<string | null, CategoryDto[]>();
	for (const category of flat) {
		const parent =
			category.parentId && ids.has(category.parentId)
				? category.parentId
				: null;
		const list = childrenOf.get(parent) ?? [];
		list.push(category);
		childrenOf.set(parent, list);
	}
	const visit = (
		parentId: string | null,
		depth: number,
		prefix: string,
		seen: Set<string>,
	): CategoryNode[] =>
		(childrenOf.get(parentId) ?? [])
			.filter((c) => !seen.has(c.id))
			.sort(bySortOrder)
			.map((category) => {
				const path = prefix ? `${prefix} › ${category.name}` : category.name;
				const nextSeen = new Set(seen).add(category.id);
				return {
					...category,
					depth,
					path,
					children: visit(category.id, depth + 1, path, nextSeen),
				};
			});
	return visit(null, 0, "", new Set());
}

/** Depth-first list, the order a picker shows them in. */
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
	return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/** Ids of a category and everything under it. */
export function descendantIds(node: CategoryNode): Set<string> {
	const ids = new Set<string>([node.id]);
	for (const child of node.children) {
		for (const id of descendantIds(child)) {
			ids.add(id);
		}
	}
	return ids;
}
