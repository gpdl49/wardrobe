import { describe, expect, it } from "vitest";
import type { CategoryNode } from "@/lib/client/categories";
import { reorder } from "./category-tree-editor";

const node = (id: string, sortOrder: number): CategoryNode => ({
	id,
	name: id,
	slug: id,
	parentId: null,
	sortOrder,
	depth: 0,
	path: id,
	children: [],
});

describe("reorder", () => {
	it("swaps with the neighbour and renumbers only what changed", () => {
		const siblings = [node("a", 0), node("b", 1), node("c", 2)];
		expect(reorder(siblings, "c", -1)).toEqual([
			{ id: "c", sortOrder: 1 },
			{ id: "b", sortOrder: 2 },
		]);
	});

	it("repairs ties and gaps", () => {
		const siblings = [node("a", 5), node("b", 5), node("c", 9)];
		expect(reorder(siblings, "a", 1)).toEqual([
			{ id: "b", sortOrder: 0 },
			{ id: "a", sortOrder: 1 },
			{ id: "c", sortOrder: 2 },
		]);
	});

	it("does nothing at the ends", () => {
		const siblings = [node("a", 0), node("b", 1)];
		expect(reorder(siblings, "a", -1)).toEqual([]);
		expect(reorder(siblings, "b", 1)).toEqual([]);
	});
});
