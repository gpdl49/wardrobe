import {
	createStore,
	del,
	delMany,
	get,
	set,
	type UseStore,
	values,
} from "idb-keyval";
import type {
	BlobSlot,
	QueueStore,
	UploadJob,
} from "@/lib/client/upload/types";

/**
 * IndexedDB persistence for the upload queue (two tiny key-value stores via
 * idb-keyval). Captures survive reloads, app switches and iOS killing the
 * tab; Safari keeps Blobs in IndexedDB.
 */
export function createIdbStore(name = "wardrobe-uploads"): QueueStore {
	let jobs: UseStore | undefined;
	let blobs: UseStore | undefined;
	// Opened lazily: indexedDB does not exist during server rendering.
	const jobStore = () => {
		jobs ??= createStore(`${name}-jobs`, "jobs");
		return jobs;
	};
	const blobStore = () => {
		blobs ??= createStore(`${name}-blobs`, "blobs");
		return blobs;
	};
	const blobKey = (id: string, slot: BlobSlot) => `${id}:${slot}`;

	return {
		loadJobs: () => values<UploadJob>(jobStore()),
		saveJob: (job) => set(job.id, job, jobStore()),
		async deleteJob(id) {
			await delMany(
				[blobKey(id, "original"), blobKey(id, "upload")],
				blobStore(),
			);
			await del(id, jobStore());
		},
		getBlob: (id, slot) => get<Blob>(blobKey(id, slot), blobStore()),
		putBlob: (id, slot, blob) => set(blobKey(id, slot), blob, blobStore()),
		deleteBlob: (id, slot) => del(blobKey(id, slot), blobStore()),
	};
}
