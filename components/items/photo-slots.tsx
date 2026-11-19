"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, RotateCw } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { Preview } from "@/components/pack/capture-loop";
import { Photo } from "@/components/photo";
import { cn } from "@/components/ui/cn";
import { ErrorText } from "@/components/ui/feedback";
import type { ItemDetailDto, PhotoDto } from "@/lib/api/types";
import { queryKeys } from "@/lib/client/queries";
import {
	type UploadJob,
	type UploadQueue,
	UploadQueueContext,
	useQueueSnapshot,
} from "@/lib/client/upload";

type SlotKind = "main" | "back" | "label" | "detail";

const SLOTS: { kind: SlotKind; label: string; single: boolean }[] = [
	{ kind: "main", label: "Front", single: true },
	{ kind: "back", label: "Back", single: true },
	{ kind: "label", label: "Label", single: true },
	{ kind: "detail", label: "Detail", single: false },
];

const tile =
	"relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg text-xs";

/**
 * Front, Back, Label and Detail tiles under the gallery. An empty tile takes
 * or picks a photo (phones open the camera); a filled one shows that photo in
 * the gallery. Detail always offers another. Uploads go through the
 * persistent upload queue, so they survive a reload or going offline.
 */
export function PhotoSlots({
	item,
	onShow,
}: {
	item: ItemDetailDto;
	onShow: (photoId: string) => void;
}) {
	const queue = useContext(UploadQueueContext);
	if (!queue || item.access === "view") return null;
	return <Slots queue={queue} item={item} onShow={onShow} />;
}

function Slots({
	queue,
	item,
	onShow,
}: {
	queue: UploadQueue;
	item: ItemDetailDto;
	onShow: (photoId: string) => void;
}) {
	const client = useQueryClient();
	const { jobs } = useQueueSnapshot(queue);
	const [error, setError] = useState<string | null>(null);
	const pending = jobs.filter(
		(job) => job.itemId === item.id && !job.createItem && !job.sessionId,
	);

	// A finished upload is on the server now: show it from there.
	const handled = useRef(new Set<string>());
	const done = pending
		.filter((job) => job.status === "done" && !handled.current.has(job.id))
		.map((job) => job.id);
	const doneKey = done.join();
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the finished job ids.
	useEffect(() => {
		if (done.length === 0) return;
		for (const id of done) handled.current.add(id);
		void client
			.invalidateQueries({ queryKey: queryKeys.item(item.id) })
			.then(() => Promise.all(done.map((id) => queue.discard(id))));
	}, [client, doneKey, item.id, queue]);

	const add = async (kind: SlotKind, files: FileList | null) => {
		setError(null);
		for (const blob of Array.from(files ?? [])) {
			try {
				await queue.enqueueItemPhoto({ blob, itemId: item.id, kind });
			} catch (err) {
				setError(`Could not save the photo on this device: ${String(err)}`);
			}
		}
	};

	return (
		<section aria-label="Add photos" className="flex flex-col gap-2">
			<ul className="grid grid-cols-4 gap-2">
				{SLOTS.map((slot) => {
					const existing = item.photos.find((p) => p.kind === slot.kind);
					const uploading = pending.filter(
						(job) => job.kind === slot.kind && job.status !== "done",
					);
					// Details stay addable while earlier ones upload; a failed one
					// takes the tile so it can be retried.
					const shown =
						uploading.find((job) => job.status === "failed") ??
						(slot.single ? uploading[0] : undefined);
					return (
						<li key={slot.kind} className="flex flex-col gap-1">
							{shown ? (
								<UploadingTile
									job={shown}
									label={slot.label}
									onRetry={() => void queue.retry(shown.id)}
								/>
							) : slot.single && existing ? (
								<FilledTile
									photo={existing}
									label={slot.label}
									onShow={() => onShow(existing.id)}
								/>
							) : (
								<EmptyTile
									label={slot.label}
									action={
										slot.single
											? `Add ${slot.label.toLowerCase()} photo`
											: "Add detail photo"
									}
									multiple={!slot.single}
									onFiles={(files) => void add(slot.kind, files)}
								/>
							)}
							<span className="text-center text-xs text-muted">
								{slot.label}
								{!slot.single && uploading.length > 0 ? (
									<span role="status"> · uploading {uploading.length}</span>
								) : null}
							</span>
						</li>
					);
				})}
			</ul>
			<ErrorText error={error} />
		</section>
	);
}

function EmptyTile({
	label,
	action,
	multiple,
	onFiles,
}: {
	label: string;
	action: string;
	multiple: boolean;
	onFiles: (files: FileList | null) => void;
}) {
	return (
		<label
			className={cn(
				tile,
				"cursor-pointer border border-dashed border-line-strong text-muted transition hover:border-accent hover:text-accent",
			)}
		>
			<Plus aria-hidden className="size-5" />
			<span className="sr-only">{action}</span>
			<input
				type="file"
				accept="image/*"
				capture="environment"
				multiple={multiple}
				className="sr-only"
				data-testid={`slot-${label.toLowerCase()}`}
				onChange={(e) => {
					onFiles(e.target.files);
					// Allow the same file again.
					e.target.value = "";
				}}
			/>
		</label>
	);
}

function FilledTile({
	photo,
	label,
	onShow,
}: {
	photo: PhotoDto;
	label: string;
	onShow: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={`Show ${label.toLowerCase()} photo`}
			onClick={onShow}
			className={cn(tile, "bg-sunken")}
		>
			<Photo
				photo={photo}
				variant="thumb"
				alt=""
				className="absolute inset-0 size-full"
			/>
		</button>
	);
}

function UploadingTile({
	job,
	label,
	onRetry,
}: {
	job: UploadJob;
	label: string;
	onRetry: () => void;
}) {
	const failed = job.status === "failed";
	return (
		<div className={cn(tile, "bg-sunken")}>
			<span className="absolute inset-0">
				<Preview blob={job.preview} />
			</span>
			<span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
				{failed ? (
					<button
						type="button"
						onClick={onRetry}
						aria-label={`Retry ${label.toLowerCase()} photo`}
						title={job.error ?? undefined}
						className="flex flex-col items-center gap-1"
					>
						<AlertTriangle aria-hidden className="size-4" />
						<RotateCw aria-hidden className="size-4" />
					</button>
				) : (
					<Loader2
						aria-label={`Uploading ${label.toLowerCase()} photo`}
						className="size-5 animate-spin"
					/>
				)}
			</span>
		</div>
	);
}
