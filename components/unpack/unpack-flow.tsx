"use client";

import { Check, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LocationPicker } from "@/components/pack/location-picker";
import type { ItemSummaryDto, LocationDto, LocationRef } from "@/lib/api/types";
import { kindLabel } from "@/lib/client/location-codes";
import {
	endSession,
	errorMessage,
	getLocation,
	HttpError,
	moveItems,
	startSession,
} from "@/lib/client/pack-api";

type LastMove = { items: ItemSummaryDto[]; to: LocationRef };

/** Injectable for tests. */
export type UnpackApi = {
	getLocation: typeof getLocation;
	moveItems: typeof moveItems;
	startSession: typeof startSession;
	endSession: typeof endSession;
};

const defaultApi: UnpackApi = {
	getLocation,
	moveItems,
	startSession,
	endSession,
};

type Props = {
	/** From /unpack?location=<id> (e.g. /l/<code>?then=unpack). */
	initialLocationId?: string;
	api?: UnpackApi;
};

/**
 * /unpack: pick the bag being emptied, select items, move them to a closet
 * or drawer (picked or scanned). One session per source location; the last
 * move can be undone.
 */
export function UnpackFlow({ initialLocationId, api = defaultApi }: Props) {
	const router = useRouter();
	const [source, setSource] = useState<LocationRef | null>(null);
	const [items, setItems] = useState<ItemSummaryDto[] | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [choosingDestination, setChoosingDestination] = useState(false);
	const [lastMove, setLastMove] = useState<LastMove | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const sessionId = useRef<string | null>(null);

	const open = async (id: string) => {
		setError(null);
		setItems(null);
		try {
			const location = await api.getLocation(id);
			setSource(location);
			setItems(location.items);
			setSelected(new Set());
			setLastMove(null);
			sessionId.current = null;
		} catch (err) {
			setError(errorMessage(err));
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: only the initial id
	useEffect(() => {
		if (initialLocationId) void open(initialLocationId);
	}, [initialLocationId]);

	const ensureSession = async (locationId: string) => {
		sessionId.current ??= (
			await api.startSession({ mode: "unpack", locationId })
		).id;
		return sessionId.current;
	};

	const move = async (destination: LocationDto) => {
		if (!source || !items) return;
		setChoosingDestination(false);
		setBusy(true);
		setError(null);
		const moving = items.filter((item) => selected.has(item.id));
		try {
			const session = await ensureSession(source.id);
			await api.moveItems({
				itemIds: moving.map((item) => item.id),
				toLocationId: destination.id,
				sessionId: session,
			});
			setItems(items.filter((item) => !selected.has(item.id)));
			setSelected(new Set());
			setLastMove({ items: moving, to: destination });
		} catch (err) {
			// 409: the session was ended elsewhere; the next try starts a new one.
			if (err instanceof HttpError && err.status === 409)
				sessionId.current = null;
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const undo = async () => {
		if (!source || !lastMove || !items) return;
		setBusy(true);
		setError(null);
		try {
			await api.moveItems({
				itemIds: lastMove.items.map((item) => item.id),
				toLocationId: source.id,
				sessionId: sessionId.current ?? undefined,
			});
			const back = new Set(lastMove.items.map((item) => item.id));
			setItems([
				...lastMove.items,
				...items.filter((item) => !back.has(item.id)),
			]);
			setLastMove(null);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const finish = async () => {
		if (sessionId.current) {
			await api.endSession(sessionId.current).catch(() => undefined);
		}
		sessionId.current = null;
		setSource(null);
		setItems(null);
		setLastMove(null);
		if (initialLocationId) router.replace("/unpack");
	};

	if (!source) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-neutral-600 dark:text-neutral-300">
					Which bag or suitcase are you unpacking?
				</p>
				{error && (
					<p role="alert" className="text-sm text-red-600">
						{error}
					</p>
				)}
				<LocationPicker
					preferKinds={["bag", "suitcase"]}
					onChoose={(location) => void open(location.id)}
				/>
			</div>
		);
	}

	if (choosingDestination) {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<p className="font-medium">
						Move {selected.size} item{selected.size === 1 ? "" : "s"} to…
					</p>
					<button
						type="button"
						onClick={() => setChoosingDestination(false)}
						className="text-sm underline"
					>
						Cancel
					</button>
				</div>
				<LocationPicker
					preferKinds={["closet", "drawer"]}
					excludeId={source.id}
					onChoose={(location) => void move(location)}
				/>
			</div>
		);
	}

	const all = items ?? [];
	const allSelected = all.length > 0 && selected.size === all.length;

	return (
		<div className="flex flex-col gap-4 pb-24">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-xs uppercase tracking-wide text-neutral-500">
						Unpacking {kindLabel(source.kind).toLowerCase()}
					</p>
					<p className="text-lg font-semibold">
						<span className="font-mono">{source.code}</span> {source.name}
					</p>
				</div>
				<button
					type="button"
					onClick={() => void finish()}
					className="rounded-xl border border-neutral-300 px-4 py-2 font-medium dark:border-neutral-700"
				>
					Done
				</button>
			</div>

			{lastMove && (
				<div
					role="status"
					className="flex items-center justify-between gap-3 rounded-xl bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100"
				>
					<span>
						Moved {lastMove.items.length} to{" "}
						<strong className="font-mono">{lastMove.to.code}</strong>
					</span>
					<button
						type="button"
						disabled={busy}
						onClick={() => void undo()}
						className="flex items-center gap-1 rounded-md border border-green-700 px-3 py-1.5 font-medium disabled:opacity-50"
					>
						<Undo2 className="size-4" aria-hidden />
						Undo
					</button>
				</div>
			)}
			{error && (
				<p role="alert" className="text-sm text-red-600">
					{error}
				</p>
			)}

			{items === null ? (
				<p className="text-neutral-500">Loading items…</p>
			) : all.length === 0 ? (
				<p className="py-6 text-center text-neutral-500">
					{source.code} is empty.
				</p>
			) : (
				<>
					<div className="flex items-center justify-between text-sm">
						<span>
							{selected.size} of {all.length} selected
						</span>
						<button
							type="button"
							onClick={() =>
								setSelected(
									allSelected ? new Set() : new Set(all.map((i) => i.id)),
								)
							}
							className="font-medium text-brand underline dark:text-white"
						>
							{allSelected ? "Select none" : "Select all"}
						</button>
					</div>
					<ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
						{all.map((item) => {
							const on = selected.has(item.id);
							return (
								<li key={item.id}>
									<button
										type="button"
										aria-pressed={on}
										onClick={() => {
											const next = new Set(selected);
											if (on) next.delete(item.id);
											else next.add(item.id);
											setSelected(next);
										}}
										className="relative block aspect-square w-full overflow-hidden rounded-xl border-2 border-transparent bg-neutral-200 aria-pressed:border-brand dark:bg-neutral-800"
									>
										<Thumb item={item} />
										<span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-left text-xs text-white">
											{item.name ?? item.category?.name ?? "Unnamed"}
										</span>
										{on && (
											<span className="absolute top-1 right-1 rounded-full bg-brand p-0.5 text-white">
												<Check className="size-4" aria-hidden />
											</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				</>
			)}

			<div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 px-4 md:bottom-4">
				<button
					type="button"
					disabled={selected.size === 0 || busy}
					onClick={() => setChoosingDestination(true)}
					className="mx-auto block h-14 w-full max-w-md rounded-2xl bg-brand text-lg font-semibold text-white shadow-lg disabled:opacity-40"
				>
					{selected.size === 0
						? "Select items to move"
						: `Move ${selected.size} item${selected.size === 1 ? "" : "s"}…`}
				</button>
			</div>
		</div>
	);
}

function Thumb({ item }: { item: ItemSummaryDto }) {
	const photo = item.coverPhoto;
	if (photo?.status !== "ready") return null;
	return (
		// biome-ignore lint/performance/noImgElement: presigned redirect, not optimisable by next/image
		<img
			src={photo.urls.thumb}
			alt=""
			loading="lazy"
			className="size-full object-cover"
		/>
	);
}
