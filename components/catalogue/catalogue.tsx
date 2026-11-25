"use client";

import {
	LayoutGrid,
	List,
	SearchX,
	Shirt,
	SlidersHorizontal,
	X,
} from "lucide-react";
import Link from "next/link";
import { ToggleGroup } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ItemGrid, type ItemSelection } from "@/components/items/item-tile";
import { WardrobeSwitcher } from "@/components/sharing/wardrobe-switcher";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import {
	EmptyState,
	ErrorText,
	errorMessage,
	Loading,
	Spinner,
} from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { SearchBox } from "@/components/ui/search-box";
import type { ItemSummaryDto } from "@/lib/api/types";
import type { ItemsQuery } from "@/lib/client/api";
import {
	type CatalogueAction,
	catalogueActions,
	useCatalogueAction,
} from "@/lib/client/catalogue-actions";
import {
	activeFilterCount,
	type CatalogueFilters,
	toItemsQuery,
} from "@/lib/client/filters";
import {
	itemTitle,
	locationLabel,
	SEASON_LABELS,
	STATUS_LABELS,
} from "@/lib/client/labels";
import { useCategories, useItems, useLocations } from "@/lib/client/queries";
import { FilterControls } from "./filter-controls";
import { useCatalogueFilters } from "./use-catalogue-filters";

export function Catalogue() {
	const { filters, setFilters, clearFilters } = useCatalogueFilters();
	const query = useMemo(() => toItemsQuery(filters), [filters]);

	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
			<aside className="hidden w-60 shrink-0 lg:block">
				<div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto pb-4">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold">Filters</h2>
						{activeFilterCount(filters) > 0 ? (
							<Button variant="ghost" size="sm" onClick={clearFilters}>
								Clear
							</Button>
						) : null}
					</div>
					<FilterControls filters={filters} onChange={setFilters} />
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col gap-4">
				<WardrobeSwitcher
					value={filters.owner}
					// Locations and tags belong to one wardrobe.
					onChange={(owner) => setFilters({ owner, location: "", tag: "" })}
				/>
				<Toolbar
					filters={filters}
					setFilters={setFilters}
					clearFilters={clearFilters}
				/>
				<ActiveFilters
					filters={filters}
					setFilters={setFilters}
					clearFilters={clearFilters}
				/>
				<CatalogueResults
					key={JSON.stringify(query)}
					query={query}
					filters={filters}
					clearFilters={clearFilters}
				/>
			</div>
		</div>
	);
}

function CatalogueResults({
	query,
	filters,
	clearFilters,
}: {
	query: ItemsQuery;
	filters: CatalogueFilters;
	clearFilters: () => void;
}) {
	const items = useItems(query);
	const all = useMemo(
		() => items.data?.pages.flatMap((p) => p.items) ?? [],
		[items.data],
	);
	const filtered = activeFilterCount(filters) > 0 || filters.q !== "";
	// A failed next page keeps the pages already loaded on screen.
	const nextPageError = items.isFetchNextPageError ? items.error : null;

	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [action, setAction] = useState<CatalogueAction | "">("");
	const actionId = useId();
	const bulk = useCatalogueAction();
	const editable = all.filter((item) => item.access !== "view");
	const ids = editable
		.filter((item) => selected.has(item.id))
		.map((item) => item.id);
	const selection: ItemSelection | undefined = selecting
		? {
				ids: selected,
				disabled: bulk.isPending,
				onToggle(id) {
					setSelected((current) => {
						const next = new Set(current);
						if (next.has(id)) next.delete(id);
						else next.add(id);
						return next;
					});
				},
			}
		: undefined;
	const result = bulk.data;
	const failure = result?.failed[0];
	const failedItem = failure && all.find((item) => item.id === failure.id);

	return (
		<>
			{editable.length > 0 || selecting ? (
				<div
					className={cn(
						"flex flex-wrap items-center gap-2",
						selecting &&
							"sticky top-14 z-[6] rounded-card border border-line bg-surface p-3 shadow-xs",
					)}
				>
					<Button
						onClick={() => {
							setSelecting(!selecting);
							setSelected(new Set());
							setAction("");
							bulk.reset();
						}}
						disabled={bulk.isPending}
					>
						{selecting ? "Done" : "Select items"}
					</Button>
					{selecting ? (
						<>
							<span role="status" className="text-sm text-muted">
								{ids.length} selected
							</span>
							<Button
								variant="ghost"
								disabled={bulk.isPending || editable.length === 0}
								onClick={() =>
									setSelected(
										ids.length === editable.length
											? new Set()
											: new Set(editable.map((item) => item.id)),
									)
								}
							>
								{ids.length > 0 && ids.length === editable.length
									? "Clear selection"
									: "Select all loaded"}
							</Button>
							<label htmlFor={actionId} className="sr-only">
								Action
							</label>
							<Select
								id={actionId}
								value={action}
								disabled={bulk.isPending}
								className="w-auto max-w-full flex-1 sm:flex-none"
								onChange={(e) => {
									setAction(e.target.value as CatalogueAction | "");
									bulk.reset();
								}}
							>
								<option value="">Choose an action…</option>
								{Object.entries(catalogueActions).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</Select>
							<Button
								variant="primary"
								disabled={!action || ids.length === 0 || bulk.isPending}
								onClick={() => {
									if (action && ids.length > 0) bulk.mutate({ action, ids });
								}}
							>
								{bulk.isPending ? "Running…" : "Run action"}
							</Button>
							{action === "suggestions" ? (
								<p className="basis-full text-sm text-muted">
									Adds suggested tags and replaces item colours with the latest
									available suggestion.
								</p>
							) : null}
							{result ? (
								<p role="status" className="basis-full text-sm">
									{result.processed}{" "}
									{result.action === "suggestions" ? "updated" : "queued"} ·{" "}
									{result.skipped} skipped · {result.failed.length} failed
								</p>
							) : null}
							{failure ? (
								<ErrorText
									className="basis-full"
									error={
										failedItem
											? `${itemTitle(failedItem)} – ${errorMessage(failure.error)}`
											: failure.error
									}
								/>
							) : null}
						</>
					) : null}
				</div>
			) : null}
			{items.isPending ? (
				<Loading label="Loading items…" />
			) : !items.data ? (
				<ErrorText error={items.error} />
			) : all.length === 0 ? (
				filtered ? (
					<EmptyState
						icon={<SearchX />}
						title="No items match"
						action={
							<Button onClick={clearFilters}>Clear filters and search</Button>
						}
					>
						Try fewer filters or a different search.
					</EmptyState>
				) : filters.owner ? (
					<EmptyState icon={<Shirt />} title="Nothing to show">
						Nothing has been shared with you in this wardrobe yet.
					</EmptyState>
				) : (
					<EmptyState
						icon={<Shirt />}
						title="Nothing catalogued yet"
						action={
							<Link
								href="/pack"
								className={buttonClass({ variant: "primary" })}
							>
								Start packing
							</Link>
						}
					>
						Items appear here as you photograph them while packing.
					</EmptyState>
				)
			) : (
				<>
					<Results items={all} filters={filters} selection={selection} />
					<LoadMore
						hasNextPage={items.hasNextPage}
						isFetching={items.isFetchingNextPage}
						onLoad={() => void items.fetchNextPage()}
						error={nextPageError}
					/>
				</>
			)}
		</>
	);
}

function Toolbar({
	filters,
	setFilters,
	clearFilters,
}: {
	filters: CatalogueFilters;
	setFilters: (patch: Partial<CatalogueFilters>) => void;
	clearFilters: () => void;
}) {
	const id = useId();
	const [sheetOpen, setSheetOpen] = useState(false);
	const count = activeFilterCount(filters);
	return (
		<div className="flex flex-wrap items-center gap-2">
			<SearchBox
				value={filters.q}
				onChange={(q) => setFilters({ q })}
				className="min-w-0 basis-full sm:basis-auto sm:flex-1"
			/>
			<Dialog
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				title="Filters"
				trigger={
					<Button className="lg:hidden" aria-label="Filters">
						<SlidersHorizontal />
						Filters
						{count > 0 ? (
							<span className="rounded-full bg-accent px-1.5 text-xs text-accent-fg">
								{count}
							</span>
						) : null}
					</Button>
				}
				footer={
					<>
						<Button onClick={clearFilters} disabled={count === 0}>
							Clear
						</Button>
						<Button variant="primary" onClick={() => setSheetOpen(false)}>
							Show items
						</Button>
					</>
				}
			>
				<FilterControls filters={filters} onChange={setFilters} />
			</Dialog>
			<label htmlFor={`${id}-group`} className="sr-only">
				Group by
			</label>
			<Select
				id={`${id}-group`}
				value={filters.group}
				onChange={(e) =>
					setFilters({ group: e.target.value as CatalogueFilters["group"] })
				}
				className="w-auto flex-1 sm:flex-none"
			>
				<option value="none">No grouping</option>
				<option value="location">By location</option>
				<option value="category">By category</option>
			</Select>
			<ToggleGroup.Root
				type="single"
				value={filters.view}
				onValueChange={(view) => {
					if (view) {
						setFilters({ view: view as CatalogueFilters["view"] });
					}
				}}
				aria-label="View"
				className="flex rounded-lg border border-line bg-surface p-0.5"
			>
				{(
					[
						["grid", LayoutGrid, "Grid"],
						["list", List, "List"],
					] as const
				).map(([value, Icon, label]) => (
					<ToggleGroup.Item
						key={value}
						value={value}
						aria-label={label}
						className="flex size-10 items-center justify-center rounded-md text-muted transition data-[state=on]:bg-sunken data-[state=on]:text-fg pointer-fine:size-8"
					>
						<Icon aria-hidden className="size-4" />
					</ToggleGroup.Item>
				))}
			</ToggleGroup.Root>
		</div>
	);
}

function ActiveFilters({
	filters,
	setFilters,
	clearFilters,
}: {
	filters: CatalogueFilters;
	setFilters: (patch: Partial<CatalogueFilters>) => void;
	clearFilters: () => void;
}) {
	const locations = useLocations({ owner: filters.owner || undefined });
	const categories = useCategories();
	const chips: Array<{ key: keyof CatalogueFilters; label: string }> = [];
	if (filters.location) {
		const l = locations.data?.find((x) => x.id === filters.location);
		chips.push({ key: "location", label: l ? locationLabel(l) : "Location" });
	}
	if (filters.category) {
		const c = categories.flat.find((x) => x.id === filters.category);
		chips.push({ key: "category", label: c?.name ?? "Category" });
	}
	if (filters.tag) chips.push({ key: "tag", label: `#${filters.tag}` });
	if (filters.season)
		chips.push({ key: "season", label: SEASON_LABELS[filters.season] });
	if (filters.color) chips.push({ key: "color", label: filters.color });
	if (filters.status)
		chips.push({ key: "status", label: STATUS_LABELS[filters.status] });
	if (chips.length === 0) {
		return null;
	}
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{chips.map(({ key, label }) => (
				<button
					key={key}
					type="button"
					onClick={() => setFilters({ [key]: "" })}
					aria-label={`Remove filter ${label}`}
					className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent-soft py-1 pr-2 pl-3 text-sm font-medium text-accent capitalize transition hover:brightness-95 pointer-fine:min-h-7"
				>
					{label}
					<X aria-hidden className="size-3.5" />
				</button>
			))}
			{chips.length > 1 ? (
				<button
					type="button"
					onClick={clearFilters}
					className="min-h-9 px-2 text-sm text-muted hover:underline pointer-fine:min-h-7"
				>
					Clear all
				</button>
			) : null}
		</div>
	);
}

function Results({
	items,
	filters,
	selection,
}: {
	items: ItemSummaryDto[];
	filters: CatalogueFilters;
	selection?: ItemSelection;
}) {
	const groups = useMemo(
		() => groupItems(items, filters.group),
		[items, filters.group],
	);
	if (!groups) {
		return <ItemGrid items={items} view={filters.view} selection={selection} />;
	}
	return (
		<div className="flex flex-col gap-6">
			{groups.map((group) => (
				<section key={group.key} aria-label={group.label}>
					<h2
						className={cn(
							"-mx-4 mb-2 flex items-baseline gap-2 bg-canvas/90 px-4 py-2 font-semibold backdrop-blur",
							!selection && "sticky top-14 z-[5]",
						)}
					>
						{group.href ? (
							<Link href={group.href} className="hover:underline">
								{group.label}
							</Link>
						) : (
							group.label
						)}
						<span className="text-sm font-normal text-muted">
							{group.items.length}
						</span>
					</h2>
					<ItemGrid
						items={group.items}
						view={filters.view}
						selection={selection}
					/>
				</section>
			))}
		</div>
	);
}

export interface ItemGroup {
	key: string;
	label: string;
	href?: string;
	items: ItemSummaryDto[];
}

/** Groups the loaded items; the "none" bucket sorts last. */
export function groupItems(
	items: ItemSummaryDto[],
	by: CatalogueFilters["group"],
): ItemGroup[] | null {
	if (by === "none") {
		return null;
	}
	const groups = new Map<string, ItemGroup>();
	for (const item of items) {
		const ref = by === "location" ? item.location : item.category;
		const key = ref?.id ?? "";
		let group = groups.get(key);
		if (!group) {
			group = {
				key: key || "none",
				label: ref
					? "code" in ref
						? locationLabel(ref)
						: ref.name
					: by === "location"
						? "No location"
						: "Uncategorised",
				href: ref && by === "location" ? `/locations/${ref.id}` : undefined,
				items: [],
			};
			groups.set(key, group);
		}
		group.items.push(item);
	}
	return [...groups.values()].sort((a, b) =>
		a.key === "none"
			? 1
			: b.key === "none"
				? -1
				: a.label.localeCompare(b.label, undefined, { numeric: true }),
	);
}

/** Loads the next page when the sentinel scrolls into view (or on click). */
function LoadMore({
	hasNextPage,
	isFetching,
	onLoad,
	error,
}: {
	hasNextPage: boolean;
	isFetching: boolean;
	onLoad: () => void;
	error: unknown;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const load = useRef(onLoad);
	load.current = onLoad;
	useEffect(() => {
		const el = ref.current;
		if (
			!el ||
			!hasNextPage ||
			error ||
			typeof IntersectionObserver === "undefined"
		) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					load.current();
				}
			},
			{ rootMargin: "800px 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasNextPage, error]);
	if (!hasNextPage) {
		return null;
	}
	return (
		<div ref={ref} className="flex flex-col items-center gap-2 py-6">
			<ErrorText error={error} />
			{isFetching ? (
				<Spinner />
			) : (
				<Button variant="ghost" onClick={onLoad}>
					Load more
				</Button>
			)}
		</div>
	);
}
