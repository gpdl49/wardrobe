"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { CategoryDto } from "@/lib/api/types";

type Props = {
	categories: readonly CategoryDto[];
	value: string | null;
	onChange: (categoryId: string | null) => void;
};

const chip =
	"shrink-0 rounded-full border px-4 py-2 text-sm font-medium active:opacity-70";
const off =
	"border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900";
const on = "border-brand bg-brand text-white";

/**
 * One row of category chips, drilling into the tree: picking "Tops" selects
 * it and shows Knitwear, Shirts … underneath. Tap the selected chip to clear.
 */
export function CategoryChips({ categories, value, onChange }: Props) {
	const byId = new Map(categories.map((c) => [c.id, c]));
	const hasChildren = (id: string) => categories.some((c) => c.parentId === id);
	const levelFor = (id: string | null): string | null => {
		if (!id) return null;
		return hasChildren(id) ? id : (byId.get(id)?.parentId ?? null);
	};
	const [level, setLevel] = useState<string | null>(() => levelFor(value));

	// Follow the selected item (the chips are reused across captures).
	// biome-ignore lint/correctness/useExhaustiveDependencies: only when the value changes
	useEffect(() => {
		setLevel(levelFor(value));
	}, [value]);

	const shown = categories
		.filter((c) => c.parentId === level)
		.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	const parent = level ? byId.get(level) : undefined;

	return (
		<fieldset
			aria-label="Category"
			className="-mx-4 flex min-w-0 gap-2 overflow-x-auto border-0 px-4 pb-1 [scrollbar-width:none]"
		>
			{parent && (
				<button
					type="button"
					onClick={() => setLevel(parent.parentId)}
					className={`${chip} ${parent.id === value ? on : off} flex items-center gap-1`}
					aria-label={`Back from ${parent.name}`}
				>
					<ChevronLeft className="size-4" aria-hidden />
					{parent.name}
				</button>
			)}
			{shown.map((category) => {
				const selected = category.id === value;
				return (
					<button
						key={category.id}
						type="button"
						aria-pressed={selected}
						onClick={() => {
							if (selected) {
								onChange(null);
								return;
							}
							onChange(category.id);
							if (hasChildren(category.id)) setLevel(category.id);
						}}
						className={`${chip} ${selected ? on : off}`}
					>
						{category.name}
					</button>
				);
			})}
		</fieldset>
	);
}
