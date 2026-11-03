"use client";

import { useEffect, useState } from "react";
import type { PhotoStatus } from "@/lib/api/types";
import { api } from "@/lib/client/api";
import type { UploadJob } from "@/lib/client/upload/types";

const POLL_MS = 4000;
const MAX_POLLS = 45;

/**
 * Server-side status of uploaded photos (renditions are made after
 * /complete). Polls GET /api/items/{id} for photos still pending/processing.
 * Returns photoId -> status for the photos it has heard about.
 */
export function usePhotoStatuses(
	jobs: readonly UploadJob[],
): Record<string, PhotoStatus> {
	const [statuses, setStatuses] = useState<Record<string, PhotoStatus>>({});
	const waiting = jobs.filter(
		(job) =>
			job.status === "done" &&
			job.photo &&
			job.itemId &&
			(statuses[job.photo.id] ?? job.photo.status) !== "ready" &&
			(statuses[job.photo.id] ?? job.photo.status) !== "failed",
	);
	const itemIds = [...new Set(waiting.map((job) => job.itemId as string))]
		.sort()
		.join(",");

	useEffect(() => {
		if (!itemIds) return;
		let polls = 0;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			polls += 1;
			const results = await Promise.allSettled(
				itemIds.split(",").map((id) => api.items.get(id)),
			);
			if (cancelled) return;
			const next: Record<string, PhotoStatus> = {};
			for (const result of results) {
				if (result.status !== "fulfilled") continue;
				for (const photo of result.value.photos) next[photo.id] = photo.status;
			}
			setStatuses((prev) => ({ ...prev, ...next }));
			if (polls < MAX_POLLS && document.visibilityState !== "hidden") {
				timer = setTimeout(poll, POLL_MS);
			}
		};
		timer = setTimeout(poll, POLL_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [itemIds]);

	return statuses;
}

export type CaptureState =
	| "uploading"
	| "waiting"
	| "processing"
	| "ready"
	| "failed";

/** One status for the capture strip, combining the local queue and the server. */
export function captureState(
	job: UploadJob,
	statuses: Record<string, PhotoStatus>,
): CaptureState {
	if (job.status === "failed") return "failed";
	if (job.status === "retrying") return "waiting";
	if (job.status !== "done" || !job.photo) return "uploading";
	const status = statuses[job.photo.id] ?? job.photo.status;
	if (status === "ready") return "ready";
	if (status === "failed") return "failed";
	return "processing";
}
