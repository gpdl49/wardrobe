"use client";

import {
	Archive,
	Briefcase,
	ChevronRight,
	DoorClosed,
	Layers,
	type LucideIcon,
	MapPin,
	Package,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
	Badge,
	EmptyState,
	ErrorText,
	Loading,
} from "@/components/ui/feedback";
import { SearchBox } from "@/components/ui/search-box";
import type { LocationDto, LocationKind } from "@/lib/api/types";
import { KIND_LABELS, LOCATION_KINDS } from "@/lib/client/labels";
import { useLocations } from "@/lib/client/queries";
import { LocationDialog } from "./location-dialog";

export const KIND_ICONS: Record<LocationKind, LucideIcon> = {
	bag: Package,
	suitcase: Briefcase,
	closet: DoorClosed,
	drawer: Layers,
	other: MapPin,
};

interface Node {
	location: LocationDto;
	children: Node[];
}

/**
 * Roots (no parent, or a parent not in the list) grouped by kind; nested
 * locations sit under their parent whatever their kind.
 */
export function locationForest(locations: LocationDto[]) {
	const ids = new Set(locations.map((l) => l.id));
	const byParent = new Map<string, LocationDto[]>();
	for (const l of locations) {
		if (l.parentId && ids.has(l.parentId)) {
			byParent.set(l.parentId, [...(byParent.get(l.parentId) ?? []), l]);
		}
	}
	const sort = (list: LocationDto[]) =>
		[...list].sort((a, b) =>
			a.code.localeCompare(b.code, undefined, { numeric: true }),
		);
	const build = (l: LocationDto, seen: Set<string>): Node => ({
		location: l,
		children: sort(byParent.get(l.id) ?? [])
			.filter((c) => !seen.has(c.id))
			.map((c) => build(c, new Set(seen).add(c.id))),
	});
	const roots = sort(
		locations.filter((l) => !l.parentId || !ids.has(l.parentId)),
	);
	return LOCATION_KINDS.map((kind) => ({
		kind,
		nodes: roots
			.filter((l) => l.kind === kind)
			.map((l) => build(l, new Set([l.id]))),
	})).filter((group) => group.nodes.length > 0);
}

const total = (node: Node): number =>
	node.location.itemCount + node.children.reduce((n, c) => n + total(c), 0);

export function LocationsList() {
	const [q, setQ] = useState("");
	const [archived, setArchived] = useState(false);
	const locations = useLocations(archived ? { archived: true } : {});
	const filtered = useMemo(() => {
		const needle = q.trim().toLowerCase();
		const list = locations.data ?? [];
		return needle
			? list.filter((l) =>
					[l.code, l.name, l.notes ?? ""].some((s) =>
						s.toLowerCase().includes(needle),
					),
				)
			: list;
	}, [locations.data, q]);
	const forest = useMemo(() => locationForest(filtered), [filtered]);

	return (
		<>
			<PageHeader title="Locations">
				<LocationDialog
					trigger={
						<Button variant="primary">
							<Plus />
							New location
						</Button>
					}
				/>
			</PageHeader>
			<div className="mb-5 flex flex-wrap items-center gap-3">
				<SearchBox
					value={q}
					onChange={setQ}
					delay={0}
					className="min-w-0 flex-1 basis-60"
				/>
				<label className="flex min-h-11 items-center gap-2 text-sm text-muted pointer-fine:min-h-9">
					<input
						type="checkbox"
						checked={archived}
						onChange={(e) => setArchived(e.target.checked)}
						className="size-4 accent-accent"
					/>
					Show archived
				</label>
			</div>
			{locations.isPending ? (
				<Loading />
			) : locations.isError ? (
				<ErrorText error={locations.error} />
			) : forest.length === 0 ? (
				<EmptyState
					icon={<MapPin />}
					title={q ? "No locations match" : "No locations yet"}
				>
					{q
						? "Try another code or name."
						: "Add your bags, suitcases and closets, then print labels for them."}
				</EmptyState>
			) : (
				<div className="grid gap-6 lg:grid-cols-2">
					{forest.map(({ kind, nodes }) => {
						const Icon = KIND_ICONS[kind];
						return (
							<section key={kind} aria-labelledby={`kind-${kind}`}>
								<h2
									id={`kind-${kind}`}
									className="mb-2 flex items-center gap-2 font-semibold"
								>
									<Icon aria-hidden className="size-4 text-muted" />
									{KIND_LABELS[kind].many}
									<span className="text-sm font-normal text-muted">
										{nodes.length}
									</span>
								</h2>
								<ul className="overflow-hidden rounded-card border border-line bg-surface">
									{nodes.map((node) => (
										<LocationNode
											key={node.location.id}
											node={node}
											depth={0}
										/>
									))}
								</ul>
							</section>
						);
					})}
				</div>
			)}
		</>
	);
}

function LocationNode({ node, depth }: { node: Node; depth: number }) {
	const { location } = node;
	const Icon = KIND_ICONS[location.kind];
	const nested = total(node) - location.itemCount;
	return (
		<li className="border-line not-first:border-t">
			<Link
				href={`/locations/${location.id}`}
				className={cn(
					"flex min-h-14 items-center gap-3 px-4 py-2 transition hover:bg-sunken",
					location.archivedAt && "opacity-60",
				)}
				style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
			>
				{depth > 0 ? (
					<Icon aria-hidden className="size-4 shrink-0 text-faint" />
				) : null}
				<span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-sm font-semibold">
					{location.code}
				</span>
				<span className="min-w-0 flex-1 truncate">{location.name}</span>
				{location.archivedAt ? (
					<Badge>
						<Archive aria-hidden className="size-3" />
						Archived
					</Badge>
				) : null}
				<span className="text-sm text-muted tabular-nums">
					{location.itemCount}
					{nested > 0 ? ` +${nested}` : ""}
					<span className="sr-only"> items</span>
				</span>
				<ChevronRight aria-hidden className="size-4 text-faint" />
			</Link>
			{node.children.length > 0 ? (
				<ul>
					{node.children.map((child) => (
						<LocationNode
							key={child.location.id}
							node={child}
							depth={depth + 1}
						/>
					))}
				</ul>
			) : null}
		</li>
	);
}
