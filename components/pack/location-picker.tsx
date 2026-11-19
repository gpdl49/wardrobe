"use client";

import { Plus, QrCode, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QrScanner } from "@/components/scan/qr-scanner";
import { sharedWardrobes } from "@/components/sharing/wardrobe-switcher";
import { errorMessage } from "@/components/ui/feedback";
import type {
	LocationDto,
	LocationKind,
	SharedWithMeDto,
} from "@/lib/api/types";
import { api, isApiError } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/current-user";
import {
	defaultName,
	kindForCode,
	kindLabel,
	nextFreeCode,
	PACK_LOCATION_KINDS,
} from "@/lib/client/location-codes";
import type { ParsedLabel } from "@/lib/client/qr";

type Props = {
	/** Offer new bags/suitcases with the next free code, and unknown scanned labels. */
	allowCreate?: boolean;
	/** Kinds listed first (closets and drawers when unpacking into them). */
	preferKinds?: readonly LocationKind[];
	excludeId?: string;
	/** A code of the caller's own to resolve straight away (/pack?code=…). */
	initialCode?: string;
	/**
	 * Only this wardrobe (the destination when unpacking: items cannot change
	 * owner). Without it the caller's own, with a choice of shared ones.
	 */
	ownerId?: string;
	onChoose: (location: LocationDto) => void;
};

/** Scan a label, search the list, or create the next bag/suitcase. */
export function LocationPicker({
	allowCreate = false,
	preferKinds = [],
	excludeId,
	initialCode,
	ownerId,
	onChoose,
}: Props) {
	const me = useCurrentUser();
	const [chosenOwner, setChosenOwner] = useState("");
	const [shared, setShared] = useState<SharedWithMeDto[]>([]);
	const listOwner = ownerId ?? (chosenOwner || undefined);
	const isOwn = !listOwner || listOwner === me?.id;
	const [all, setAll] = useState<LocationDto[] | null>(null);
	const [query, setQuery] = useState("");
	const [scanning, setScanning] = useState(false);
	const [unknownCode, setUnknownCode] = useState<string | null>(null);
	const [unavailableCode, setUnavailableCode] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			// Archived ones too: their codes are taken.
			const rows = await api.locations.list({
				archived: true,
				...(listOwner ? { owner: listOwner } : {}),
			});
			setAll(rows);
			return rows;
		} catch (err) {
			setError(errorMessage(err));
			return null;
		}
	}, [listOwner]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (ownerId) return;
		// Only adds a choice: without it the caller's own wardrobe still works.
		api.shares
			.sharedWithMe()
			.then(setShared)
			.catch(() => undefined);
	}, [ownerId]);

	/** Moving and packing write, so a view-only location is not a choice. */
	const choose = useCallback(
		(location: LocationDto) => {
			if (location.access === "view") {
				setError(`You have view access to ${location.code}.`);
				return;
			}
			onChoose(location);
		},
		[onChoose],
	);

	const resolveLabel = useCallback(
		async ({ ownerId: labelOwner, code }: ParsedLabel) => {
			setScanning(false);
			setError(null);
			setUnknownCode(null);
			setUnavailableCode(null);
			if (ownerId && labelOwner && labelOwner !== ownerId) {
				setError(`${code} is in another wardrobe; items cannot move there.`);
				return;
			}
			// A typed code searches the wardrobe on screen.
			const owner = labelOwner ?? listOwner;
			const known = all?.find((l) => l.code === code);
			if (
				known &&
				!known.archivedAt &&
				(!labelOwner || known.ownerId === labelOwner)
			) {
				choose(known);
				return;
			}
			setBusy(true);
			try {
				choose(await api.locations.getByCode(code, { owner }));
			} catch (err) {
				if (isApiError(err, 404)) {
					// Only your own labels can be set up, in your own wardrobe.
					if (!owner || owner === me?.id) {
						setUnknownCode(code);
					} else {
						setUnavailableCode(code);
					}
				} else {
					setError(errorMessage(err));
				}
			} finally {
				setBusy(false);
			}
		},
		[all, choose, listOwner, me?.id, ownerId],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resolve the initial code once
	useEffect(() => {
		if (initialCode) void resolveLabel({ ownerId: null, code: initialCode });
	}, [initialCode]);

	const create = async (kind: LocationKind, code: string) => {
		setBusy(true);
		setError(null);
		try {
			onChoose(
				await api.locations.create({
					kind,
					code,
					name: defaultName(kind, code),
				}),
			);
		} catch (err) {
			if (isApiError(err, 409)) {
				await load();
				setError(`${code} was just taken; pick the new suggestion.`);
			} else {
				setError(errorMessage(err));
			}
		} finally {
			setBusy(false);
		}
	};

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		const rank = (kind: LocationKind) => {
			const i = preferKinds.indexOf(kind);
			return i === -1 ? preferKinds.length : i;
		};
		return (all ?? [])
			.filter((l) => !l.archivedAt && l.id !== excludeId && l.access !== "view")
			.filter(
				(l) =>
					!q ||
					l.code.toLowerCase().includes(q) ||
					l.name.toLowerCase().includes(q),
			)
			.sort(
				(a, b) => rank(a.kind) - rank(b.kind) || a.code.localeCompare(b.code),
			);
	}, [all, query, excludeId, preferKinds]);

	const codes = (all ?? []).map((l) => l.code);
	const wardrobes = ownerId ? [] : sharedWardrobes(shared);

	return (
		<div className="flex flex-col gap-4">
			<button
				type="button"
				onClick={() => setScanning(true)}
				className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-brand text-lg font-semibold text-white active:opacity-80"
			>
				<QrCode className="size-7" aria-hidden />
				Scan label
			</button>

			{wardrobes.length > 0 && (
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">Wardrobe</span>
					<select
						value={chosenOwner}
						onChange={(e) => {
							setChosenOwner(e.target.value);
							setUnknownCode(null);
							setUnavailableCode(null);
							setAll(null);
						}}
						className="h-12 rounded-xl border border-neutral-300 bg-white px-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
					>
						<option value="">My wardrobe</option>
						{wardrobes.map((w) => (
							<option key={w.id} value={w.id}>
								{w.label}
							</option>
						))}
					</select>
				</label>
			)}

			{unavailableCode && (
				<p
					role="alert"
					className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950"
				>
					<strong>{unavailableCode}</strong> doesn't exist or isn't shared with
					you.
				</p>
			)}

			{unknownCode && (
				<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
					<p>
						<strong>{unknownCode}</strong> is not set up yet.
					</p>
					{allowCreate && (
						<button
							type="button"
							disabled={busy}
							onClick={() => void create(kindForCode(unknownCode), unknownCode)}
							className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white disabled:opacity-50"
						>
							Create {kindLabel(kindForCode(unknownCode)).toLowerCase()}{" "}
							{unknownCode}
						</button>
					)}
				</div>
			)}

			{allowCreate && isOwn && all && (
				<div className="grid gap-3 sm:grid-cols-3">
					{PACK_LOCATION_KINDS.map((kind) => {
						const code = nextFreeCode(codes, kind);
						return (
							<button
								key={kind}
								type="button"
								disabled={busy}
								onClick={() => void create(kind, code)}
								className="flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-3 font-medium disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
							>
								<Plus className="size-5" aria-hidden />
								New {kindLabel(kind).toLowerCase()} {code}
							</button>
						);
					})}
				</div>
			)}

			{error && (
				<p role="alert" className="text-sm text-red-600 dark:text-red-400">
					{error}
				</p>
			)}

			<label className="relative block">
				<span className="sr-only">Search locations</span>
				<Search
					className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400"
					aria-hidden
				/>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search bags, suitcases, closets"
					className="h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base dark:border-neutral-700 dark:bg-neutral-900"
				/>
			</label>

			{all === null && !error ? (
				<p className="text-sm text-neutral-500">Loading locations…</p>
			) : (
				<ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
					{visible.map((location) => (
						<li key={location.id}>
							<button
								type="button"
								onClick={() => choose(location)}
								className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-neutral-100 dark:active:bg-neutral-800"
							>
								<span>
									<span className="font-mono font-semibold">
										{location.code}
									</span>{" "}
									<span className="text-neutral-600 dark:text-neutral-300">
										{location.name}
									</span>
								</span>
								<span className="text-xs text-neutral-500">
									{kindLabel(location.kind)} · {location.itemCount}
								</span>
							</button>
						</li>
					))}
					{visible.length === 0 && (
						<li className="px-4 py-3 text-sm text-neutral-500">No matches.</li>
					)}
				</ul>
			)}

			{scanning && (
				<QrScanner
					onCode={(label) => void resolveLabel(label)}
					onClose={() => setScanning(false)}
				/>
			)}
		</div>
	);
}
