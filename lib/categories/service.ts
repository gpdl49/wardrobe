import { z } from "zod";
import type { CategoryDto } from "@/lib/api/types";
import type {
	CreateCategoryInput,
	UpdateCategoryInput,
} from "@/lib/categories/schema";
import { categorySlug } from "@/lib/categories/schema";
import {
	descendantIds,
	slugify,
	uniqueSlug,
	wouldCycle,
} from "@/lib/categories/tree";
import { db } from "@/lib/db";
import type { Category } from "@/lib/generated/prisma/client";
import { conflict, notFound, unprocessable } from "@/lib/http/errors";

/**
 * Categories: a small tree (tens of rows), so tree rules load the whole table.
 *
 * Delete rule: a category with child categories or items is a 409; move or
 * delete those first. (The schema would null the items' category, but losing
 * a classification silently is worse than one more step.)
 */

export function toCategoryDto(category: Category): CategoryDto {
	return {
		id: category.id,
		name: category.name,
		slug: category.slug,
		parentId: category.parentId,
		sortOrder: category.sortOrder,
	};
}

function parseId(id: string): string {
	const parsed = z.uuid().safeParse(id);
	if (!parsed.success) {
		throw notFound("Category not found");
	}
	return parsed.data;
}

const treeSelect = { id: true, parentId: true } as const;

export async function listCategories(): Promise<CategoryDto[]> {
	const rows = await db().category.findMany({
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	});
	return rows.map(toCategoryDto);
}

/**
 * Resolves an id or slug to the ids of that category and all below it, or
 * null if there is no such category (the items filter).
 */
export async function categoryWithDescendants(
	idOrSlug: string,
): Promise<string[] | null> {
	const nodes = await db().category.findMany({
		select: { ...treeSelect, slug: true },
	});
	const slug = categorySlug.safeParse(idOrSlug);
	const root = nodes.find(
		(n) => n.id === idOrSlug || (slug.success && n.slug === slug.data),
	);
	return root ? descendantIds(nodes, root.id) : null;
}

async function assertSlugFree(slug: string, exceptId?: string) {
	const existing = await db().category.findUnique({
		where: { slug },
		select: { id: true },
	});
	if (existing && existing.id !== exceptId) {
		throw conflict(`Category slug ${slug} is already in use`);
	}
}

async function assertParentExists(parentId: string) {
	const parent = await db().category.findUnique({
		where: { id: parentId },
		select: { id: true },
	});
	if (!parent) {
		throw unprocessable("Parent category does not exist");
	}
}

export async function createCategory(
	input: CreateCategoryInput,
): Promise<CategoryDto> {
	if (input.parentId) {
		await assertParentExists(input.parentId);
	}
	let slug: string;
	if (input.slug) {
		await assertSlugFree(input.slug);
		slug = input.slug;
	} else {
		const base = slugify(input.name).slice(0, 100) || "category";
		const taken = await db().category.findMany({
			where: { slug: { startsWith: base } },
			select: { slug: true },
		});
		slug = uniqueSlug(base, new Set(taken.map((t) => t.slug)));
	}
	const category = await db().category.create({
		data: {
			name: input.name,
			slug,
			parentId: input.parentId ?? null,
			sortOrder: input.sortOrder ?? 0,
		},
	});
	return toCategoryDto(category);
}

export async function updateCategory(
	id: string,
	input: UpdateCategoryInput,
): Promise<CategoryDto> {
	const categoryId = parseId(id);
	const existing = await db().category.findUnique({
		where: { id: categoryId },
		select: { id: true },
	});
	if (!existing) {
		throw notFound("Category not found");
	}
	if (input.slug !== undefined) {
		await assertSlugFree(input.slug, categoryId);
	}
	if (input.parentId) {
		if (input.parentId === categoryId) {
			throw unprocessable("A category cannot be its own parent");
		}
		await assertParentExists(input.parentId);
		const nodes = await db().category.findMany({ select: treeSelect });
		if (wouldCycle(nodes, categoryId, input.parentId)) {
			throw unprocessable("A category cannot be moved below itself");
		}
	}
	const category = await db().category.update({
		where: { id: categoryId },
		data: {
			name: input.name,
			slug: input.slug,
			parentId: input.parentId,
			sortOrder: input.sortOrder,
		},
	});
	return toCategoryDto(category);
}

/** 409 while it has child categories or items (see the module comment). */
export async function deleteCategory(id: string): Promise<void> {
	const categoryId = parseId(id);
	const category = await db().category.findUnique({
		where: { id: categoryId },
		include: { _count: { select: { children: true, items: true } } },
	});
	if (!category) {
		throw notFound("Category not found");
	}
	const { children, items } = category._count;
	if (children > 0 || items > 0) {
		throw conflict(
			`Category ${category.name} still has ${children} subcategory(ies) and ${items} item(s); move them first`,
		);
	}
	await db().category.delete({ where: { id: categoryId } });
}
