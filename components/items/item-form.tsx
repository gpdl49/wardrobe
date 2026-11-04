"use client";

import { type FormEvent, useId, useState } from "react";
import {
	indent,
	LocationOptions,
} from "@/components/catalogue/filter-controls";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ErrorText } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ItemStatus, ItemSummaryDto, Season } from "@/lib/api/types";
import type { ItemInput } from "@/lib/client/api";
import {
	ITEM_STATUSES,
	SEASON_LABELS,
	SEASONS,
	STATUS_LABELS,
} from "@/lib/client/labels";
import {
	useCategories,
	useLocations,
	useTags,
	useUpdateItem,
} from "@/lib/client/queries";
import { TagInput } from "./tag-input";

const TEXT_FIELDS = [
	["name", "Name"],
	["brand", "Brand"],
	["size", "Size"],
	["pattern", "Pattern"],
	["material", "Material"],
] as const;

type TextField = (typeof TEXT_FIELDS)[number][0];

interface FormState {
	name: string;
	brand: string;
	size: string;
	pattern: string;
	material: string;
	notes: string;
	categoryId: string;
	locationId: string;
	status: ItemStatus;
	seasons: Season[];
	tags: string[];
}

const toState = (item: ItemSummaryDto): FormState => ({
	name: item.name ?? "",
	brand: item.brand ?? "",
	size: item.size ?? "",
	pattern: item.pattern ?? "",
	material: item.material ?? "",
	notes: item.notes ?? "",
	categoryId: item.category?.id ?? "",
	locationId: item.location?.id ?? "",
	status: item.status,
	seasons: item.seasons,
	tags: item.tags,
});

/** Only what changed; blank text becomes null (the API rejects ""). */
export function diffItem(before: FormState, after: FormState): ItemInput {
	const patch: ItemInput = {};
	const nullable = (v: string) => (v.trim() === "" ? null : v.trim());
	for (const key of [
		"name",
		"brand",
		"size",
		"pattern",
		"material",
		"notes",
	] as const) {
		if (before[key].trim() !== after[key].trim()) {
			patch[key] = nullable(after[key]);
		}
	}
	if (before.categoryId !== after.categoryId)
		patch.categoryId = after.categoryId || null;
	if (before.locationId !== after.locationId)
		patch.locationId = after.locationId || null;
	if (before.status !== after.status) patch.status = after.status;
	const sameList = (a: string[], b: string[]) =>
		a.length === b.length && a.every((x, i) => x === b[i]);
	if (!sameList(before.seasons, after.seasons)) patch.seasons = after.seasons;
	if (!sameList(before.tags, after.tags)) patch.tags = after.tags;
	return patch;
}

export function SeasonToggles({
	value,
	onChange,
}: {
	value: Season[];
	onChange: (value: Season[]) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-1.5">
			{SEASONS.map((season) => {
				const on = value.includes(season);
				return (
					<button
						key={season}
						type="button"
						aria-pressed={on}
						onClick={() =>
							onChange(
								on
									? value.filter((s) => s !== season)
									: SEASONS.filter((s) => s === season || value.includes(s)),
							)
						}
						className={cn(
							"min-h-11 rounded-lg border text-sm font-medium transition pointer-fine:min-h-9",
							on
								? "border-accent bg-accent text-accent-fg"
								: "border-line bg-surface hover:bg-sunken",
						)}
					>
						{SEASON_LABELS[season]}
					</button>
				);
			})}
		</div>
	);
}

export function ItemForm({
	item,
	onDone,
}: {
	item: ItemSummaryDto;
	onDone: () => void;
}) {
	const id = useId();
	const [initial] = useState(() => toState(item));
	const [state, setState] = useState(initial);
	const update = useUpdateItem(item.id);
	const categories = useCategories();
	const locations = useLocations({ owner: item.ownerId });
	const tags = useTags(item.ownerId);
	const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
		setState((s) => ({ ...s, [key]: value }));

	const submit = (e: FormEvent) => {
		e.preventDefault();
		const patch = diffItem(initial, state);
		if (Object.keys(patch).length === 0) {
			onDone();
			return;
		}
		update.mutate(patch, { onSuccess: onDone });
	};

	const text = (key: TextField, label: string) => (
		<Field key={key} label={label} htmlFor={`${id}-${key}`}>
			<Input
				id={`${id}-${key}`}
				value={state[key]}
				onChange={(e) => set(key, e.target.value)}
				autoComplete="off"
			/>
		</Field>
	);

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			{text("name", "Name")}
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Category" htmlFor={`${id}-category`}>
					<Select
						id={`${id}-category`}
						value={state.categoryId}
						onChange={(e) => set("categoryId", e.target.value)}
					>
						<option value="">No category</option>
						{categories.flat.map((c) => (
							<option key={c.id} value={c.id}>
								{indent(c.depth)}
								{c.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Location" htmlFor={`${id}-location`}>
					<Select
						id={`${id}-location`}
						value={state.locationId}
						onChange={(e) => set("locationId", e.target.value)}
					>
						<option value="">No location</option>
						<LocationOptions locations={locations.data ?? []} />
					</Select>
				</Field>
				{TEXT_FIELDS.slice(1).map(([key, label]) => text(key, label))}
				<Field label="Status" htmlFor={`${id}-status`}>
					<Select
						id={`${id}-status`}
						value={state.status}
						onChange={(e) => set("status", e.target.value as ItemStatus)}
					>
						{ITEM_STATUSES.map((s) => (
							<option key={s} value={s}>
								{STATUS_LABELS[s]}
							</option>
						))}
					</Select>
				</Field>
			</div>
			<Field label="Seasons">
				<SeasonToggles
					value={state.seasons}
					onChange={(v) => set("seasons", v)}
				/>
			</Field>
			<Field label="Tags" htmlFor={`${id}-tags`}>
				<TagInput
					id={`${id}-tags`}
					value={state.tags}
					onChange={(v) => set("tags", v)}
					suggestions={tags.data ?? []}
				/>
			</Field>
			<Field label="Notes" htmlFor={`${id}-notes`}>
				<Textarea
					id={`${id}-notes`}
					value={state.notes}
					onChange={(e) => set("notes", e.target.value)}
				/>
			</Field>
			<ErrorText error={update.error} />
			<div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex gap-2 border-t border-line bg-canvas/95 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:py-0">
				<Button type="button" className="flex-1 md:flex-none" onClick={onDone}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					className="flex-1 md:flex-none"
					disabled={update.isPending}
				>
					{update.isPending ? "Saving…" : "Save"}
				</Button>
			</div>
		</form>
	);
}
