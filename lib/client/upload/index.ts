"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { attachLifecycle } from "@/lib/client/upload/lifecycle";
import { type QueueSnapshot, UploadQueue } from "@/lib/client/upload/queue";
import { prepareImage } from "@/lib/client/upload/resize";
import { createIdbStore } from "@/lib/client/upload/store";

export type { QueueSnapshot } from "@/lib/client/upload/queue";
export { UploadQueue } from "@/lib/client/upload/queue";
export type { JobStatus, UploadJob } from "@/lib/client/upload/types";

const queues = new Map<string, UploadQueue>();

/**
 * This user's queue, on its own IndexedDB stores: someone else signing in on
 * the device neither sees nor sends these jobs. Browser only.
 */
export function getUploadQueue(userId: string): UploadQueue {
	let queue = queues.get(userId);
	if (!queue) {
		queue = new UploadQueue({
			store: createIdbStore(uploadStoreName(userId)),
			prepare: prepareImage,
		});
		queues.set(userId, queue);
	}
	return queue;
}

export const uploadStoreName = (userId: string) => `wardrobe-uploads-${userId}`;

/**
 * Resumes the user's pending uploads on every page, not only while /pack is
 * open. The returned function pauses them again (the user changed).
 */
export function activateUploadQueue(queue: UploadQueue): () => void {
	queue.resume();
	const detach = attachLifecycle(queue);
	return () => {
		detach();
		queue.pause();
	};
}

/** The signed-in user's queue (lib/client/current-user); tests supply their own. */
export const UploadQueueContext = createContext<UploadQueue | null>(null);

/** Render only once the current user is known. */
export function useUploadQueue(): UploadQueue {
	const queue = useContext(UploadQueueContext);
	if (!queue) {
		throw new Error("useUploadQueue before the current user is known");
	}
	return queue;
}

const EMPTY: QueueSnapshot = { jobs: [], authRequired: false, loaded: false };

export function useQueueSnapshot(queue: UploadQueue): QueueSnapshot {
	return useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => EMPTY);
}
