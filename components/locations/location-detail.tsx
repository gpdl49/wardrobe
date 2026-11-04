"use client";

import {
	ArrowLeft,
	ArrowRightLeft,
	ChevronRight,
	Pencil,
	Plus,
	Printer,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { LocationOptions } from "@/components/catalogue/filter-controls";
import { ItemGrid } from "@/components/items/item-tile";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import {
	Badge,
	EmptyState,
	ErrorText,
	Loading,
} from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import type { LocationDetailDto } from "@/lib/api/types";
import { canRestructure } from "@/lib/client/access";
import { isApiError } from "@/lib/client/api";
import {
	formatDate,
	itemTitle,
	KIND_LABELS,
	locationLabel,
	SEASON_LABELS,
} from "@/lib/client/labels";
import {
	useDeleteLocation,
	useLocation,
	useLocations,
	useMoveItems,
	useSharedWithMe,
} from "@/lib/client/queries";
import { LocationDialog } from "./location-dialog";
import { KIND_ICONS } from "./locations-list";

export function LocationDetail({ id }: { id: string }) {
	const location = useLocation(id);
	if (location.isPending) {
		return <Loading />;
	}
	if (!location.data) {
		return isApiError(location.error, 404) ? (
			<EmptyState
				title="Location not found"
				action={<Link href="/locations">All locations</Link>}
			/>
		) : (
			<ErrorText error={location.error} />
		);
	}
	return <LocationView location={location.data} />;
}

function LocationView({ location }: { location: LocationDetailDto }) {
	const router = useRouter();
	const all = useLocations({ archived: true, owner: location.ownerId });
	const shared = useSharedWithMe();
	const canEdit = location.access !== "view";
	const restructurable = canRestructure(location, shared.data ?? []);
	const remove = useDeleteLocation();
	const parent = all.data?.find((l) => l.id === location.parentId);
	const Icon = KIND_ICONS[location.kind];
	const [view, setView] = useState<"grid" | "list">("grid");

	return (
		<>
			<div className="flex flex-col gap-6 print:hidden">
				<div className="flex flex-wrap items-start gap-2">
					<Button
						variant="ghost"
						size="icon"
						aria-label="All locations"
						onClick={() => router.push("/locations")}
					>
						<ArrowLeft />
					</Button>
					<div className="min-w-0 flex-1">
						<p className="flex items-center gap-1.5 text-sm text-muted">
							<Icon aria-hidden className="size-4" />
							{KIND_LABELS[location.kind].one}
							{parent ? (
								<>
									{" in "}
									<Link
										href={`/locations/${parent.id}`}
										className="font-medium text-accent hover:underline"
									>
										{locationLabel(parent)}
									</Link>
								</>
							) : null}
							{location.archivedAt ? <Badge>Archived</Badge> : null}
						</p>
						<h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight">
							<span className="font-mono">{location.code}</span>
							{location.name !== location.code ? (
								<span className="font-normal text-muted">{location.name}</span>
							) : null}
						</h1>
						{location.notes ? (
							<p className="mt-1 text-sm whitespace-pre-wrap text-muted">
								{location.notes}
							</p>
						) : null}
					</div>
				</div>

				<div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
					{canEdit ? <MoveAllDialog location={location} /> : null}
					<Button onClick={() => window.print()}>
						<Printer />
						Print contents
					</Button>
					{canEdit ? (
						<>
							<LocationDialog
								location={location}
								lockParent={!restructurable}
								trigger={
									<Button>
										<Pencil />
										Edit
									</Button>
								}
							/>
							<LocationDialog
								ownerId={location.ownerId}
								defaultParentId={location.id}
								trigger={
									<Button>
										<Plus />
										Add inside
									</Button>
								}
							/>
						</>
					) : null}
					{canEdit && restructurable ? (
						<ConfirmDialog
							title={`Delete ${location.code}?`}
							description={
								location.itemCount > 0
									? "It still holds items: move them out first."
									: "The location is deleted. Its label will stop working."
							}
							onConfirm={async () => {
								await remove.mutateAsync(location.id);
								router.replace("/locations");
							}}
							trigger={
								<Button variant="danger-ghost">
									<Trash2 />
									Delete
								</Button>
							}
						/>
					) : null}
				</div>

				{location.children.length > 0 ? (
					<section aria-labelledby="inside-heading">
						<h2 id="inside-heading" className="mb-2 font-semibold">
							Inside
						</h2>
						<ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{location.children.map((child) => {
								const ChildIcon = KIND_ICONS[child.kind];
								return (
									<li key={child.id}>
										<Link
											href={`/locations/${child.id}`}
											className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface px-4 py-2 transition hover:bg-sunken"
										>
											<ChildIcon aria-hidden className="size-4 text-muted" />
											<span className="font-mono text-sm font-semibold">
												{child.code}
											</span>
											<span className="min-w-0 flex-1 truncate text-sm">
												{child.name}
											</span>
											<span className="text-sm text-muted tabular-nums">
												{child.itemCount}
											</span>
											<ChevronRight aria-hidden className="size-4 text-faint" />
										</Link>
									</li>
								);
							})}
						</ul>
					</section>
				) : null}

				<section aria-labelledby="contents-heading">
					<div className="mb-2 flex items-center justify-between gap-2">
						<h2 id="contents-heading" className="font-semibold">
							Contents{" "}
							<span className="font-normal text-muted">
								{location.items.length}
							</span>
						</h2>
						<div className="flex gap-1">
							<Button
								size="sm"
								variant={view === "grid" ? "secondary" : "ghost"}
								aria-pressed={view === "grid"}
								onClick={() => setView("grid")}
							>
								Grid
							</Button>
							<Button
								size="sm"
								variant={view === "list" ? "secondary" : "ghost"}
								aria-pressed={view === "list"}
								onClick={() => setView("list")}
							>
								List
							</Button>
						</div>
					</div>
					{location.items.length === 0 ? (
						<EmptyState title="Empty">
							Nothing is recorded in {location.code}. Items show up here when
							you pack them into it.
						</EmptyState>
					) : (
						<ItemGrid items={location.items} view={view} />
					)}
				</section>
			</div>
			<ContentsSheet
				location={location}
				parentLabel={parent && locationLabel(parent)}
			/>
		</>
	);
}

/** Print-only contents sheet: a plain checklist to tape onto the bag. */
function ContentsSheet({
	location,
	parentLabel,
}: {
	location: LocationDetailDto;
	parentLabel?: string;
}) {
	return (
		<article className="hidden text-black print:block">
			<header className="mb-4 flex items-end justify-between border-b-2 border-black pb-2">
				<div>
					<p className="text-sm">
						{KIND_LABELS[location.kind].one}
						{parentLabel ? ` · kept in ${parentLabel}` : ""}
					</p>
					<h1 className="text-3xl font-bold">
						<span className="font-mono">{location.code}</span>{" "}
						{location.name !== location.code ? location.name : ""}
					</h1>
				</div>
				<p className="text-sm">
					{location.items.length} items · {formatDate(new Date().toISOString())}
				</p>
			</header>
			{location.children.length > 0 ? (
				<p className="mb-3 text-sm">
					<strong>Inside:</strong>{" "}
					{location.children.map((c) => locationLabel(c)).join(", ")}
				</p>
			) : null}
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-b border-black text-left">
						<th className="w-6 py-1" aria-label="Checked" />
						<th className="py-1">Item</th>
						<th className="py-1">Category</th>
						<th className="py-1">Size</th>
						<th className="py-1">Colours</th>
						<th className="py-1">Seasons</th>
					</tr>
				</thead>
				<tbody>
					{location.items.map((item) => (
						<tr
							key={item.id}
							className="break-inside-avoid border-b border-neutral-300"
						>
							<td className="py-1.5 align-top">
								<span className="inline-block size-3.5 border border-black" />
							</td>
							<td className="py-1.5 pr-2 align-top">
								{itemTitle(item)}
								{item.brand ? (
									<span className="text-neutral-600"> · {item.brand}</span>
								) : null}
							</td>
							<td className="py-1.5 pr-2 align-top">{item.category?.name}</td>
							<td className="py-1.5 pr-2 align-top">{item.size}</td>
							<td className="py-1.5 pr-2 align-top">
								{item.colors.map((c) => c.name).join(", ")}
							</td>
							<td className="py-1.5 align-top">
								{item.seasons.map((s) => SEASON_LABELS[s]).join(", ")}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</article>
	);
}

function MoveAllDialog({ location }: { location: LocationDetailDto }) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const [target, setTarget] = useState("");
	const locations = useLocations({ owner: location.ownerId });
	const move = useMoveItems();
	const count = location.items.length;
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setTarget("");
				move.reset();
			}}
			title={`Move everything in ${location.code}`}
			description={`${count} item${count === 1 ? "" : "s"} will be moved. Each move is recorded in the item's history.`}
			trigger={
				<Button variant="primary" disabled={count === 0}>
					<ArrowRightLeft />
					Move all to…
				</Button>
			}
			footer={
				<>
					<Button onClick={() => setOpen(false)}>Cancel</Button>
					<Button
						variant="primary"
						disabled={!target || move.isPending}
						onClick={() =>
							move.mutate(
								{
									itemIds: location.items.map((i) => i.id),
									toLocationId: target === "none" ? null : target,
								},
								{ onSuccess: () => setOpen(false) },
							)
						}
					>
						{move.isPending ? "Moving…" : `Move ${count}`}
					</Button>
				</>
			}
		>
			<Field label="Move to" htmlFor={`${id}-target`}>
				<Select
					id={`${id}-target`}
					value={target}
					onChange={(e) => setTarget(e.target.value)}
				>
					<option value="" disabled>
						Choose a location…
					</option>
					<option value="none">Out of storage (no location)</option>
					<LocationOptions
						locations={locations.data ?? []}
						exclude={(l) => l.id === location.id}
					/>
				</Select>
			</Field>
			<ErrorText error={move.error} className="mt-3" />
		</Dialog>
	);
}
