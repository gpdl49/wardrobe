import type { PhotoDto, PhotoKind } from "@/lib/api/types";
import type { CreateItemBody, ItemFields } from "@/lib/client/pack-api";

/**
 * - queued: waiting for a free slot (or for its item, for a label photo)
 * - running: a step is in flight
 * - retrying: a step failed transiently; runs again at `nextAttemptAt`
 * - failed: gave up (permanent error or too many attempts); `retry()` requeues
 * - done: photo completed on the server (it is processing renditions)
 */
export type JobStatus = "queued" | "running" | "retrying" | "failed" | "done";

/** One captured photo on its way to the server. Persisted in IndexedDB. */
export interface UploadJob {
	/**
	 * Local id. The Idempotency-Keys are `item-<id>` and `photo-<id>`: the job
	 * is persisted, so retries and reloads reuse them.
	 */
	id: string;
	createdAt: number;
	sessionId: string | null;
	locationId: string;
	kind: PhotoKind;
	/** Main shots create their own item; label shots attach to the parent's. */
	createItem: boolean;
	/** For label shots: the job whose item the photo belongs to. */
	parentJobId: string | null;
	itemId: string | null;
	/** Quick fields; sent on create, PATCHed when edited afterwards. */
	fields: ItemFields;
	fieldsVersion: number;
	syncedFieldsVersion: number;
	/**
	 * The POST /api/items body, frozen at the first attempt: retries reuse the
	 * Idempotency-Key, so they must send the same body (later edits are
	 * PATCHed). Absent on jobs persisted before it existed.
	 */
	createItemRequest?: { body: CreateItemBody; fieldsVersion: number } | null;
	/** Downscaled and stored as the `upload` blob. */
	prepared: boolean;
	contentType: string | null;
	size: number | null;
	/** Small JPEG for the capture strip (kept after the upload). */
	preview: Blob | null;
	photoId: string | null;
	uploadUrl: string | null;
	uploadHeaders: Record<string, string> | null;
	uploaded: boolean;
	/** The photo as returned by /complete. */
	photo: PhotoDto | null;
	status: JobStatus;
	/** Consecutive failed attempts of the current step. */
	attempts: number;
	nextAttemptAt: number | null;
	error: string | null;
}

/** Large blobs live apart from job records so listing jobs stays cheap. */
export type BlobSlot = "original" | "upload";

export interface QueueStore {
	loadJobs(): Promise<UploadJob[]>;
	saveJob(job: UploadJob): Promise<void>;
	/** Deletes the job and its blobs. */
	deleteJob(id: string): Promise<void>;
	getBlob(id: string, slot: BlobSlot): Promise<Blob | undefined>;
	putBlob(id: string, slot: BlobSlot, blob: Blob): Promise<void>;
	deleteBlob(id: string, slot: BlobSlot): Promise<void>;
}
