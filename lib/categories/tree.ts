/**
 * Pure helpers for the category tree (no database access).
 */

/** Same rules as prisma/seed.mjs `slugify`, so seeded and created slugs match. */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * The first of `base`, `base-2`, `base-3`... not in `taken`. Used when a slug
 * is derived from the name; an explicit slug that is taken is a 409 instead.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
	const root = base || "category";
	if (!taken.has(root)) {
		return root;
	}
	for (let n = 2; ; n++) {
		const candidate = `${root.slice(0, 100 - String(n).length - 1)}-${n}`;
		if (!taken.has(candidate)) {
			return candidate;
		}
	}
}

type Node = { id: string; parentId: string | null };

/** `rootId` and every category below it. Tolerates cycles in bad data. */
export function descendantIds(
	nodes: readonly Node[],
	rootId: string,
): string[] {
	const children = new Map<string, string[]>();
	for (const node of nodes) {
		if (node.parentId) {
			const list = children.get(node.parentId) ?? [];
			list.push(node.id);
			children.set(node.parentId, list);
		}
	}
	const result: string[] = [];
	const seen = new Set<string>();
	const stack = [rootId];
	while (stack.length > 0) {
		const id = stack.pop() as string;
		if (seen.has(id)) {
			continue;
		}
		seen.add(id);
		result.push(id);
		stack.push(...(children.get(id) ?? []));
	}
	return result;
}

/** True if making `parentId` the parent of `selfId` would create a cycle. */
export function wouldCycle(
	nodes: readonly Node[],
	selfId: string,
	parentId: string,
): boolean {
	return descendantIds(nodes, selfId).includes(parentId);
}
