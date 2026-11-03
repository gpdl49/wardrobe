import { describe, expect, it } from "vitest";
import type { CategoryDto } from "@/lib/api/types";
import { buildCategoryTree, descendantIds, flattenTree } from "./categories";

const cat = (
	id: string,
	parentId: string | null,
	sortOrder = 0,
	name = id,
): CategoryDto => ({ id, name, slug: id, parentId, sortOrder });

describe("buildCategoryTree", () => {
	const flat = [
		cat("knitwear", "tops", 1, "Knitwear"),
		cat("tops", null, 0, "Tops"),
		cat("bottoms", null, 1, "Bottoms"),
		cat("tees", "tops", 0, "Tees"),
		cat("cardigan", "knitwear", 0, "Cardigan"),
		cat("orphan", "gone", 5, "Orphan"),
	];

	it("nests by parent and sorts siblings by sortOrder", () => {
		const tree = buildCategoryTree(flat);
		expect(tree.map((n) => n.id)).toEqual(["tops", "bottoms", "orphan"]);
		expect(tree[0]?.children.map((n) => n.id)).toEqual(["tees", "knitwear"]);
		const flatOrder = flattenTree(tree).map((n) => [n.id, n.depth]);
		expect(flatOrder).toEqual([
			["tops", 0],
			["tees", 1],
			["knitwear", 1],
			["cardigan", 2],
			["bottoms", 0],
			["orphan", 0],
		]);
		expect(flattenTree(tree).find((n) => n.id === "cardigan")?.path).toBe(
			"Tops › Knitwear › Cardigan",
		);
	});

	it("collects descendants", () => {
		const tops = buildCategoryTree(flat)[0];
		expect(tops && [...descendantIds(tops)].sort()).toEqual([
			"cardigan",
			"knitwear",
			"tees",
			"tops",
		]);
	});
});
