"use client";

import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "@/components/ui/cn";
import { Select } from "@/components/ui/field";
import type { LocationDto } from "@/lib/api/types";
import { COLOR_SWATCHES, isLight } from "@/lib/client/colors";
import type { CatalogueFilters } from "@/lib/client/filters";
import {
	ITEM_STATUSES,
	KIND_LABELS,
	LOCATION_KINDS,
	locationLabel,
	SEASON_LABELS,
	SEASONS,
	STATUS_LABELS,
} from "@/lib/client/labels";
import { useCategories, useLocations, useTags } from "@/lib/client/queries";

/** Indents a category option in a native <select> (which ignores padding). */
export const indent = (depth: number) => "   ".repeat(depth);

export function LocationOptions({
	locations,
	exclude,
}: {
	locations: LocationDto[];
	exclude?: (location: LocationDto) => boolean;
}) {
	return LOCATION_KINDS.map((kind) => {
		const ofKind = locations.filter(
			(l) => l.kind === kind && !(exclude?.(l) ?? false),
		);
		return ofKind.length > 0 ? (
			<optgroup key={kind} label={KIND_LABELS[kind].many}>
				{ofKind.map((l) => (
					<option key={l.id} value={l.id}>
						{locationLabel(l)}
					</option>
				))}
			</optgroup>
		) : null;
	});
}

function Section({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			{htmlFor ? (
				<label
					htmlFor={htmlFor}
					className="text-xs font-semibold tracking-wide text-muted uppercase"
				>
					{label}
				</label>
			) : (
				<span className="text-xs font-semibold tracking-wide text-muted uppercase">
					{label}
				</span>
			)}
			{children}
		</div>
	);
}

/** A row of single-choice pills; choosing the active one clears it. */
function Pills<T extends string>({
	label,
	options,
	value,
	onChange,
	format,
}: {
	label: string;
	options: readonly T[];
	value: T | "";
	onChange: (value: T | "") => void;
	format: (value: T) => string;
}) {
	return (
		<fieldset className="flex flex-wrap gap-1.5">
			<legend className="sr-only">{label}</legend>
			{options.map((option) => {
				const active = value === option;
				return (
					<button
						key={option}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(active ? "" : option)}
						className={cn(
							"min-h-11 rounded-full border px-3.5 text-sm font-medium transition pointer-fine:min-h-8 pointer-fine:px-3",
							active
								? "border-accent bg-accent text-accent-fg"
								: "border-line bg-surface text-fg hover:bg-sunken",
						)}
					>
						{format(option)}
					</button>
				);
			})}
		</fieldset>
	);
}

export function ColorSwatches({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<fieldset className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 pointer-fine:grid-cols-[repeat(auto-fill,minmax(2rem,1fr))]">
			<legend className="sr-only">Colour</legend>
			{COLOR_SWATCHES.map((swatch) => {
				const active = value === swatch.name;
				return (
					<button
						key={swatch.name}
						type="button"
						aria-pressed={active}
						aria-label={swatch.name}
						title={swatch.name}
						onClick={() => onChange(active ? "" : swatch.name)}
						className={cn(
							"flex aspect-square items-center justify-center rounded-full border transition",
							isLight(swatch.hex) ? "border-line-strong" : "border-transparent",
							active
								? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
								: "hover:scale-105",
						)}
						style={{ backgroundColor: swatch.hex }}
					>
						{active ? (
							<Check
								aria-hidden
								className={cn(
									"size-4",
									isLight(swatch.hex) ? "text-black" : "text-white",
								)}
							/>
						) : null}
					</button>
				);
			})}
		</fieldset>
	);
}

/** Every catalogue filter except search. Used in the sidebar and the sheet. */
export function FilterControls({
	filters,
	onChange,
}: {
	filters: CatalogueFilters;
	onChange: (patch: Partial<CatalogueFilters>) => void;
}) {
	const id = useId();
	const owner = filters.owner || undefined;
	const locations = useLocations({ owner });
	const categories = useCategories();
	const tags = useTags(owner);
	return (
		<div className="flex flex-col gap-5">
			<Section label="Location" htmlFor={`${id}-location`}>
				<Select
					id={`${id}-location`}
					value={filters.location}
					onChange={(e) => onChange({ location: e.target.value })}
				>
					<option value="">Anywhere</option>
					<LocationOptions locations={locations.data ?? []} />
				</Select>
			</Section>
			<Section label="Category" htmlFor={`${id}-category`}>
				<Select
					id={`${id}-category`}
					value={filters.category}
					onChange={(e) => onChange({ category: e.target.value })}
				>
					<option value="">All categories</option>
					{categories.flat.map((c) => (
						<option key={c.id} value={c.id}>
							{indent(c.depth)}
							{c.name}
						</option>
					))}
				</Select>
			</Section>
			<Section label="Tag" htmlFor={`${id}-tag`}>
				<Select
					id={`${id}-tag`}
					value={filters.tag}
					onChange={(e) => onChange({ tag: e.target.value })}
				>
					<option value="">Any tag</option>
					{(tags.data ?? []).map((t) => (
						<option key={t.name} value={t.name}>
							{t.name} ({t.count})
						</option>
					))}
					{filters.tag && !tags.data?.some((t) => t.name === filters.tag) ? (
						<option value={filters.tag}>{filters.tag}</option>
					) : null}
				</Select>
			</Section>
			<Section label="Season">
				<Pills
					label="Season"
					options={SEASONS}
					value={filters.season}
					onChange={(season) => onChange({ season })}
					format={(s) => SEASON_LABELS[s]}
				/>
			</Section>
			<Section label="Colour">
				<ColorSwatches
					value={filters.color}
					onChange={(color) => onChange({ color })}
				/>
			</Section>
			<Section label="Status">
				<Pills
					label="Status"
					options={ITEM_STATUSES}
					value={filters.status}
					onChange={(status) => onChange({ status })}
					format={(s) => STATUS_LABELS[s]}
				/>
			</Section>
		</div>
	);
}
