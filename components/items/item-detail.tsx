"use client";

import {
	ArrowLeft,
	ArrowRight,
	History,
	MapPin,
	Pencil,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { InOutfits } from "@/components/outfits/in-outfits";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import {
	Badge,
	EmptyState,
	ErrorText,
	Loading,
} from "@/components/ui/feedback";
import type { ItemDetailDto, LocationRef } from "@/lib/api/types";
import { isApiError } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/current-user";
import {
	formatDate,
	formatDateTime,
	itemTitle,
	locationLabel,
	SEASON_LABELS,
	STATUS_LABELS,
} from "@/lib/client/labels";
import {
	useCategories,
	useDeleteItem,
	useItem,
	useRemovePhotoBackground,
	useUpdateItem,
} from "@/lib/client/queries";
import { ItemForm } from "./item-form";
import { ColorDots } from "./item-tile";
import { PhotoGallery } from "./photo-gallery";
import { PhotoSlots } from "./photo-slots";
import { SuggestionsPanel } from "./suggestions-panel";

export function ItemDetail({ id }: { id: string }) {
	const item = useItem(id);
	if (item.isPending) {
		return <Loading />;
	}
	if (!item.data) {
		return isApiError(item.error, 404) ? (
			<EmptyState
				title="Item not found"
				action={<Link href="/">Back to the catalogue</Link>}
			>
				It may have been deleted.
			</EmptyState>
		) : (
			<ErrorText error={item.error} />
		);
	}
	return <ItemView item={item.data} />;
}

function ItemView({ item }: { item: ItemDetailDto }) {
	const router = useRouter();
	const [editing, setEditing] = useState(false);
	const [show, setShow] = useState<{ photoId: string } | null>(null);
	const remove = useDeleteItem();
	const update = useUpdateItem(item.id);
	const removeBackground = useRemovePhotoBackground(item.id);
	const title = itemTitle(item);
	const canEdit = item.access !== "view";
	const photos = [...item.photos].sort((a, b) =>
		a.id === item.coverPhoto?.id
			? -1
			: b.id === item.coverPhoto?.id
				? 1
				: a.createdAt.localeCompare(b.createdAt),
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Back"
					onClick={() =>
						window.history.length > 1 ? router.back() : router.push("/")
					}
				>
					<ArrowLeft />
				</Button>
				<h1
					style={{ opacity: item.nameGenerated ? 0.6 : 1 }}
					className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight"
				>
					{title}
				</h1>
				{canEdit && !editing ? (
					<Button onClick={() => setEditing(true)}>
						<Pencil />
						<span className="max-sm:sr-only">Edit</span>
					</Button>
				) : null}
				{canEdit ? (
					<ConfirmDialog
						title={`Delete ${title}?`}
						description="The item, its photos and its history are deleted. This cannot be undone."
						onConfirm={async () => {
							await remove.mutateAsync(item.id);
							router.replace("/");
						}}
						trigger={
							<Button
								variant="danger-ghost"
								size="icon"
								aria-label="Delete item"
							>
								<Trash2 />
							</Button>
						}
					/>
				) : null}
			</div>

			<div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
				<div className="flex flex-col gap-3 md:sticky md:top-20 md:self-start">
					<PhotoGallery
						show={show}
						photos={photos}
						alt={title}
						coverPhotoId={item.coverPhoto?.id}
						onRemoveBackground={
							canEdit ? (id) => removeBackground.mutate(id) : undefined
						}
						requestingBackgroundFor={
							removeBackground.isPending
								? removeBackground.variables
								: undefined
						}
						onSetCover={
							canEdit
								? (coverPhotoId) => update.mutate({ coverPhotoId })
								: undefined
						}
					/>
					<PhotoSlots item={item} onShow={(photoId) => setShow({ photoId })} />
					<ErrorText error={update.error} />
					<ErrorText error={removeBackground.error} />
				</div>
				<div className="flex min-w-0 flex-col gap-6">
					{canEdit && editing ? (
						<section
							aria-label="Edit item"
							className="rounded-card border border-line bg-surface p-4"
						>
							<ItemForm item={item} onDone={() => setEditing(false)} />
						</section>
					) : (
						<Details item={item} />
					)}
					<SuggestionsPanel item={item} />
					<InOutfits item={item} />
					<Movements item={item} />
				</div>
			</div>
		</div>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
			<dt className="text-sm text-muted">{label}</dt>
			<dd className="text-sm break-words">{children}</dd>
		</div>
	);
}

const none = <span className="text-faint">—</span>;

/** Tags are per wardrobe: a shared item's tag filters that wardrobe. */
export function tagHref(
	item: Pick<ItemDetailDto, "ownerId">,
	tag: string,
	viewerId: string | undefined,
) {
	const owner =
		item.ownerId === viewerId
			? ""
			: `owner=${encodeURIComponent(item.ownerId)}&`;
	return `/?${owner}tag=${encodeURIComponent(tag)}`;
}

function Details({ item }: { item: ItemDetailDto }) {
	const me = useCurrentUser();
	const categories = useCategories();
	const category = item.category
		? (categories.flat.find((c) => c.id === item.category?.id)?.path ??
			item.category.name)
		: null;
	return (
		<section
			aria-label="Details"
			className="rounded-card border border-line bg-surface px-4"
		>
			<dl className="divide-y divide-line">
				<Row label="Location">
					{item.location ? (
						<Link
							href={`/locations/${item.location.id}`}
							className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
						>
							<MapPin aria-hidden className="size-3.5" />
							{locationLabel(item.location)}
						</Link>
					) : (
						none
					)}
				</Row>
				<Row label="Status">
					<Badge
						tone={
							item.status === "active" || item.status === "stored"
								? "neutral"
								: "warning"
						}
					>
						{STATUS_LABELS[item.status]}
					</Badge>
				</Row>
				<Row label="Category">{category ?? none}</Row>
				<Row label="Brand">{item.brand ?? none}</Row>
				<Row label="Size">{item.size ?? none}</Row>
				<Row label="Colours">
					{item.colors.length > 0 ? (
						<span className="flex flex-wrap items-center gap-2">
							<ColorDots colors={item.colors} max={8} />
							{item.colors.map((c) => c.name).join(", ")}
						</span>
					) : (
						none
					)}
				</Row>
				<Row label="Pattern">{item.pattern ?? none}</Row>
				<Row label="Material">{item.material ?? none}</Row>
				<Row label="Seasons">
					{item.seasons.length > 0
						? item.seasons.map((s) => SEASON_LABELS[s]).join(", ")
						: none}
				</Row>
				<Row label="Tags">
					{item.tags.length > 0 ? (
						<span className="flex flex-wrap gap-1">
							{item.tags.map((t) => (
								<Link
									key={t}
									href={tagHref(item, t, me?.id)}
									className="rounded-full bg-accent-soft px-2.5 py-0.5 text-accent hover:underline"
								>
									{t}
								</Link>
							))}
						</span>
					) : (
						none
					)}
				</Row>
				{item.notes ? (
					<Row label="Notes">
						<span className="whitespace-pre-wrap">{item.notes}</span>
					</Row>
				) : null}
				<Row label="Added">{formatDate(item.createdAt)}</Row>
			</dl>
		</section>
	);
}

function Place({ location }: { location: LocationRef | null }) {
	return location ? (
		<Link
			href={`/locations/${location.id}`}
			className="font-medium hover:underline"
		>
			{location.code}
		</Link>
	) : (
		<span className="text-muted">nowhere</span>
	);
}

function Movements({ item }: { item: ItemDetailDto }) {
	const movements = [...item.movements].sort((a, b) =>
		b.at.localeCompare(a.at),
	);
	return (
		<section
			aria-labelledby="history-heading"
			className="rounded-card border border-line bg-surface"
		>
			<h2
				id="history-heading"
				className="flex items-center gap-2 border-b border-line px-4 py-2.5 font-semibold"
			>
				<History aria-hidden className="size-4 text-muted" />
				History
			</h2>
			{movements.length === 0 ? (
				<p className="px-4 py-6 text-sm text-muted">Never moved.</p>
			) : (
				<ol className="divide-y divide-line">
					{movements.map((m) => (
						<li
							key={m.id}
							className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm"
						>
							<Place location={m.from} />
							<ArrowRight aria-label="to" className="size-3.5 text-faint" />
							<Place location={m.to} />
							{m.sessionId ? <Badge>packing</Badge> : null}
							<time dateTime={m.at} className="ml-auto text-xs text-muted">
								{formatDateTime(m.at)}
							</time>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
