"use client";

import {
	createContext,
	useContext,
	useEffect,
	useSyncExternalStore,
} from "react";
import { attachLifecycle } from "@/lib/client/upload/lifecycle";
import { type QueueSnapshot, UploadQueue } from "@/lib/client/upload/queue";
import { prepareImage } from "@/lib/client/upload/resize";
import { createIdbStore } from "@/lib/client/upload/store";

export type { QueueSnapshot } from "@/lib/client/upload/queue";
export { UploadQueue } from "@/lib/client/upload/queue";
export type { JobStatus, UploadJob } from "@/lib/client/upload/types";

let shared: UploadQueue | undefined;
let detach: (() => void) | undefined;

/** The page-wide queue, backed by IndexedDB. Browser only. */
export function getUploadQueue(): UploadQueue {
	shared ??= new UploadQueue({
		store: createIdbStore(),
		prepare: prepareImage,
	});
	return shared;
}

/** Tests (and the capture loop) can supply their own queue. */
export const UploadQueueContext = createContext<UploadQueue | null>(null);

export function useUploadQueue(): UploadQueue {
	return useContext(UploadQueueContext) ?? getUploadQueue();
}

const EMPTY: QueueSnapshot = { jobs: [], authRequired: false, loaded: false };

export function useQueueSnapshot(queue: UploadQueue): QueueSnapshot {
	return useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => EMPTY);
}

/**
 * Mounted once in the root layout: resumes pending uploads on every page,
 * not only while /pack is open.
 */
export function UploadQueueResumer() {
	useEffect(() => {
		if (!detach) {
			detach = attachLifecycle(getUploadQueue());
		}
	}, []);
	return null;
}
