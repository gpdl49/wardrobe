import { MapPin } from "lucide-react";
import Link from "next/link";
import { Photo } from "@/components/photo";
import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/feedback";
import type { ItemColor, ItemSummaryDto } from "@/lib/api/types";
import { isLight } from "@/lib/client/colors";
import { itemTitle, SEASON_LABELS, STATUS_LABELS } from "@/lib/client/labels";

export function ColorDots({
	colors,
	max = 4,
	className,
}: {
	colors: ItemColor[];
	max?: number;
	className?: string;
}) {
	if (colors.length === 0) {
		return null;
	}
	return (
		<span className={cn("flex -space-x-1", className)}>
			{colors.slice(0, max).map((c) => (
				<span
					key={`${c.name}-${c.hex}`}
					title={c.name}
					className={cn(
						"size-3.5 rounded-full border-2 border-surface",
						isLight(c.hex) &&
							"outline outline-1 -outline-offset-2 outline-line-strong",
					)}
					style={{ backgroundColor: c.hex }}
				/>
			))}
		</span>
	);
}

/** Grid card: photo first, a line of text under it. */
export function ItemCard({
	item,
	priority,
}: {
	item: ItemSummaryDto;
	priority?: boolean;
}) {
	const title = itemTitle(item);
	return (
		<Link
			href={`/items/${item.id}`}
			className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-xs outline-none transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent"
		>
			<Photo
				photo={item.coverPhoto}
				variant="thumb"
				alt={title}
				priority={priority}
				className="aspect-[4/5]"
				imgClassName="transition duration-300 group-hover:scale-[1.03]"
			/>
			<div className="flex min-w-0 flex-col gap-0.5 p-2.5">
				<div className="flex items-center justify-between gap-2">
					<span
						style={{ opacity: item.nameGenerated ? 0.6 : 1 }}
						className="truncate text-sm font-medium"
					>
						{title}
					</span>
					<ColorDots colors={item.colors} max={3} />
				</div>
				<span className="flex items-center gap-1 truncate text-xs text-muted">
					{item.location ? (
						<>
							<MapPin aria-hidden className="size-3 shrink-0" />
							{item.location.code}
						</>
					) : (
						(item.category?.name ?? STATUS_LABELS[item.status])
					)}
				</span>
			</div>
		</Link>
	);
}

/** List row: compact, more columns of detail on wider screens. */
export function ItemRow({ item }: { item: ItemSummaryDto }) {
	const title = itemTitle(item);
	return (
		<Link
			href={`/items/${item.id}`}
			className="flex min-h-16 items-center gap-3 px-3 py-2 outline-none transition hover:bg-sunken focus-visible:bg-sunken"
		>
			<Photo
				photo={item.coverPhoto}
				variant="thumb"
				alt=""
				className="size-14 shrink-0 rounded-lg"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					style={{ opacity: item.nameGenerated ? 0.6 : 1 }}
					className="truncate font-medium"
				>
					{title}
				</span>
				<span className="truncate text-sm text-muted">
					{[item.category?.name, item.brand, item.size]
						.filter(Boolean)
						.join(" · ") || "No details"}
				</span>
			</div>
			<div className="hidden w-40 shrink-0 flex-wrap gap-1 md:flex">
				{item.seasons.map((s) => (
					<Badge key={s}>{SEASON_LABELS[s]}</Badge>
				))}
			</div>
			<ColorDots colors={item.colors} className="hidden sm:flex" />
			<div className="flex w-24 shrink-0 flex-col items-end gap-1 text-right">
				{item.location ? (
					<span
						style={{ opacity: item.nameGenerated ? 0.6 : 1 }}
						className="truncate text-sm font-medium"
					>
						{item.location.code}
					</span>
				) : (
					<span className="text-sm text-faint">—</span>
				)}
				{item.status !== "active" && item.status !== "stored" ? (
					<Badge tone="warning">{STATUS_LABELS[item.status]}</Badge>
				) : null}
			</div>
		</Link>
	);
}

export interface ItemSelection {
	ids: ReadonlySet<string>;
	disabled: boolean;
	onToggle: (id: string) => void;
}

function ItemCheckbox({
	item,
	selection,
	className,
}: {
	item: ItemSummaryDto;
	selection: ItemSelection;
	className?: string;
}) {
	return (
		<label
			className={cn(
				"flex size-11 cursor-pointer items-center justify-center",
				className,
			)}
		>
			<input
				type="checkbox"
				aria-label={`Select ${itemTitle(item)}`}
				checked={selection.ids.has(item.id)}
				disabled={selection.disabled}
				onChange={() => selection.onToggle(item.id)}
				className="size-5 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			/>
		</label>
	);
}

export function ItemGrid({
	items,
	view,
	selection,
}: {
	items: ItemSummaryDto[];
	view: "grid" | "list";
	selection?: ItemSelection;
}) {
	if (view === "list") {
		return (
			<ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
				{items.map((item) => (
					<li key={item.id} className={cn(selection && "flex items-center")}>
						{selection && item.access !== "view" ? (
							<ItemCheckbox
								item={item}
								selection={selection}
								className="shrink-0"
							/>
						) : null}
						<div className={selection ? "min-w-0 flex-1" : undefined}>
							<ItemRow item={item} />
						</div>
					</li>
				))}
			</ul>
		);
	}
	return (
		<ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 xl:grid-cols-5">
			{items.map((item, i) => (
				<li
					key={item.id}
					className={cn(
						selection && "relative",
						selection?.ids.has(item.id) &&
							item.access !== "view" &&
							"rounded-card ring-2 ring-accent",
					)}
				>
					<ItemCard item={item} priority={i < 8} />
					{selection && item.access !== "view" ? (
						<ItemCheckbox
							item={item}
							selection={selection}
							className="absolute top-1 left-1 rounded-lg bg-surface/95 shadow-sm"
						/>
					) : null}
				</li>
			))}
		</ul>
	);
}
