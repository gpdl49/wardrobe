"use client";

import {
	AlertTriangle,
	Camera,
	Check,
	CloudOff,
	Loader2,
	RotateCw,
	Tag,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryChips } from "@/components/pack/category-chips";
import type {
	CategoryDto,
	LocationRef,
	PackingSessionDto,
} from "@/lib/api/types";
import { api } from "@/lib/client/api";
import { useQueueSnapshot, useUploadQueue } from "@/lib/client/upload";
import type { UploadJob } from "@/lib/client/upload/types";
import {
	type CaptureState,
	captureState,
	usePhotoStatuses,
} from "@/lib/client/use-photo-status";

type Props = {
	session: PackingSessionDto;
	location: LocationRef;
	onEnd: () => void;
	/** Injected in tests; loaded from /api/categories otherwise. */
	categories?: CategoryDto[];
};

/**
 * The rapid capture loop: every shutter press is a new item in the location.
 * Uploads run in the background queue; the strip shows their progress and
 * the panel edits the selected (by default the latest) capture.
 */
export function CaptureLoop({
	session,
	location,
	onEnd,
	categories: given,
}: Props) {
	const queue = useUploadQueue();
	const { jobs, authRequired } = useQueueSnapshot(queue);
	const [categories, setCategories] = useState<CategoryDto[]>(given ?? []);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const online = useOnline();

	useEffect(() => {
		void queue.start();
	}, [queue]);

	useEffect(() => {
		if (given) return;
		api.categories
			.list()
			.then(setCategories)
			.catch(() => undefined);
	}, [given]);

	const captures = useMemo(
		() => jobs.filter((job) => job.sessionId === session.id && job.createItem),
		[jobs, session.id],
	);
	const extras = useMemo(() => {
		const counts = new Map<string, UploadJob[]>();
		for (const job of jobs) {
			if (!job.parentJobId) continue;
			counts.set(job.parentJobId, [
				...(counts.get(job.parentJobId) ?? []),
				job,
			]);
		}
		return counts;
	}, [jobs]);
	const statuses = usePhotoStatuses(jobs);
	const selected =
		captures.find((job) => job.id === selectedId) ?? captures.at(-1) ?? null;

	const capture = async (files: FileList | null) => {
		setError(null);
		for (const file of Array.from(files ?? [])) {
			try {
				const job = await queue.enqueueCapture({
					blob: file,
					locationId: location.id,
					sessionId: session.id,
				});
				setSelectedId(job.id);
			} catch (err) {
				setError(`Could not save the photo on this device: ${String(err)}`);
			}
		}
	};

	const addLabel = async (files: FileList | null) => {
		const file = files?.[0];
		if (!file || !selected) return;
		try {
			await queue.enqueueExtraPhoto({ blob: file, parentJobId: selected.id });
		} catch (err) {
			setError(String(err));
		}
	};

	const pending = captures.filter((job) => job.status !== "done").length;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-xs uppercase tracking-wide text-neutral-500">
						Packing into
					</p>
					<p className="text-lg font-semibold">
						<span className="font-mono">{location.code}</span> {location.name}
					</p>
				</div>
				<button
					type="button"
					onClick={onEnd}
					className="rounded-xl border border-neutral-300 px-4 py-2 font-medium dark:border-neutral-700"
				>
					Done
				</button>
			</div>

			{authRequired && (
				<div
					role="alert"
					className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
				>
					<span>Sign-in expired. Photos are kept on this device.</span>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white"
					>
						Sign in
					</button>
				</div>
			)}
			{!online && (
				<p className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
					<CloudOff className="size-4" aria-hidden />
					Offline — keep shooting, uploads resume when you are back.
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-red-600 dark:text-red-400">
					{error}
				</p>
			)}

			<ul
				aria-label="Captured items"
				className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
			>
				{[...captures].reverse().map((job, i) => (
					<li key={job.id} className="shrink-0">
						<button
							type="button"
							onClick={() => setSelectedId(job.id)}
							aria-pressed={job.id === selected?.id}
							aria-label={`Item ${captures.length - i}: ${captureState(job, statuses)}`}
							className="relative block size-20 overflow-hidden rounded-xl border-2 border-transparent bg-neutral-200 aria-pressed:border-brand dark:bg-neutral-800"
						>
							<Preview blob={job.preview} />
							<StatusBadge state={captureState(job, statuses)} />
							{(extras.get(job.id)?.length ?? 0) > 0 && (
								<span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5 text-white">
									<Tag className="size-3" aria-label="Has label photo" />
								</span>
							)}
						</button>
					</li>
				))}
			</ul>

			{selected ? (
				<SelectedPanel
					key={selected.id}
					job={selected}
					index={captures.indexOf(selected) + 1}
					state={captureState(selected, statuses)}
					extras={extras.get(selected.id) ?? []}
					categories={categories}
					onFields={(fields) => void queue.updateFields(selected.id, fields)}
					onRetry={() => {
						void queue.retry(selected.id);
						for (const extra of extras.get(selected.id) ?? [])
							void queue.retry(extra.id);
					}}
					onLabel={addLabel}
				/>
			) : (
				<p className="py-6 text-center text-neutral-500">
					Lay the first item flat and press the shutter.
				</p>
			)}

			<div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col items-center gap-1 pt-2 md:bottom-4">
				<label className="flex size-24 cursor-pointer items-center justify-center rounded-full border-4 border-white bg-brand text-white shadow-lg ring-2 ring-brand active:scale-95">
					<Camera className="size-10" aria-hidden />
					<span className="sr-only">Take photo of next item</span>
					<input
						type="file"
						accept="image/*"
						capture="environment"
						className="sr-only"
						data-testid="shutter"
						onChange={(e) => {
							void capture(e.target.files);
							// Allow the same file again and keep the input light.
							e.target.value = "";
						}}
					/>
				</label>
				<p className="text-xs text-neutral-500">
					{captures.length} item{captures.length === 1 ? "" : "s"}
					{pending > 0 && ` · ${pending} uploading`}
				</p>
			</div>
		</div>
	);
}

function SelectedPanel({
	job,
	index,
	state,
	extras,
	categories,
	onFields,
	onRetry,
	onLabel,
}: {
	job: UploadJob;
	index: number;
	state: CaptureState;
	extras: UploadJob[];
	categories: CategoryDto[];
	onFields: (fields: {
		name?: string | null;
		categoryId?: string | null;
	}) => void;
	onRetry: () => void;
	onLabel: (files: FileList | null) => void;
}) {
	const [name, setName] = useState(job.fields.name ?? "");
	const saved = useRef(job.fields.name ?? "");
	const commitName = () => {
		if (name.trim() === saved.current.trim()) return;
		saved.current = name;
		onFields({ name: name.trim() || null });
	};
	const extraFailed = extras.some((e) => e.status === "failed");

	return (
		<section
			aria-label={`Item ${index}`}
			className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
		>
			<div className="flex items-center justify-between gap-2 text-sm">
				<span className="font-medium">Item {index}</span>
				<span className="text-neutral-500">{STATE_TEXT[state]}</span>
			</div>
			{(state === "failed" || extraFailed) && job.status !== "done" ? (
				<div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
					<span>
						{job.error ?? extras.find((e) => e.error)?.error ?? "Upload failed"}
					</span>
					<button
						type="button"
						onClick={onRetry}
						className="flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white"
					>
						<RotateCw className="size-4" aria-hidden />
						Retry
					</button>
				</div>
			) : (
				extraFailed && (
					<button
						type="button"
						onClick={onRetry}
						className="self-start text-sm text-red-600 underline"
					>
						Label photo failed — retry
					</button>
				)
			)}
			<input
				type="text"
				value={name}
				onChange={(e) => setName(e.target.value)}
				onBlur={commitName}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
				placeholder="Name (optional)"
				aria-label="Name"
				enterKeyHint="done"
				autoComplete="off"
				className="h-11 rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700"
			/>
			{categories.length > 0 && (
				<CategoryChips
					categories={categories}
					value={job.fields.categoryId ?? null}
					onChange={(categoryId) => onFields({ categoryId })}
				/>
			)}
			<label className="flex cursor-pointer items-center gap-2 self-start rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700">
				<Tag className="size-4" aria-hidden />
				{extras.length > 0 ? "Add another label photo" : "Add label photo"}
				<input
					type="file"
					accept="image/*"
					capture="environment"
					className="sr-only"
					data-testid="label-input"
					onChange={(e) => {
						onLabel(e.target.files);
						e.target.value = "";
					}}
				/>
			</label>
		</section>
	);
}

const STATE_TEXT: Record<CaptureState, string> = {
	uploading: "Uploading…",
	waiting: "Waiting for network…",
	processing: "Processing…",
	ready: "Saved",
	failed: "Failed",
};

function StatusBadge({ state }: { state: CaptureState }) {
	const base = "absolute top-1 right-1 rounded-full p-0.5 text-white";
	switch (state) {
		case "ready":
			return (
				<span className={`${base} bg-green-600`}>
					<Check className="size-3.5" aria-hidden />
				</span>
			);
		case "failed":
			return (
				<span className={`${base} bg-red-600`}>
					<AlertTriangle className="size-3.5" aria-hidden />
				</span>
			);
		case "waiting":
			return (
				<span className={`${base} bg-amber-600`}>
					<CloudOff className="size-3.5" aria-hidden />
				</span>
			);
		default:
			return (
				<span className={`${base} bg-black/60`}>
					<Loader2 className="size-3.5 animate-spin" aria-hidden />
				</span>
			);
	}
}

/** Local preview from the queue (no network needed). */
export function Preview({ blob }: { blob: Blob | null }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!blob) return;
		const next = URL.createObjectURL(blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [blob]);
	if (!url) return null;
	// biome-ignore lint/performance/noImgElement: a local blob: URL, nothing to optimise
	return <img src={url} alt="" className="size-full object-cover" />;
}

function useOnline(): boolean {
	const [online, setOnline] = useState(true);
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	return online;
}
