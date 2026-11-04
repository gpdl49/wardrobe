import type { PhotoKind } from "@/lib/api/types";
import {
	type ApiClient,
	api as defaultApi,
	isApiError,
	isRetryable,
	isSignInExpired,
} from "@/lib/client/api";
import type { Prepared } from "@/lib/client/upload/resize";
import type {
	ItemFields,
	QueueStore,
	UploadJob,
} from "@/lib/client/upload/types";

/**
 * Persistent upload queue for captures: downscale → create item → POST
 * /api/photos → PUT to S3 → POST /complete (→ PATCH the item when its quick
 * fields change later). Each step's result is persisted, so a reload resumes
 * at the step that was interrupted. Transient failures back off and retry;
 * iOS has no Background Sync, so the page resumes the queue on load, when it
 * becomes visible and when the network comes back (see lifecycle.ts).
 */

export type Step =
	| "prepare"
	| "createItem"
	| "createPhoto"
	| "upload"
	| "complete"
	| "updateItem";

/** What a job needs next, derived from what it has. Null when it is finished. */
export function nextStep(job: UploadJob): Step | null {
	if (!job.prepared) return "prepare";
	if (job.createItem && !job.itemId) return "createItem";
	if (!job.photoId) return "createPhoto";
	if (!job.uploaded) return "upload";
	if (!job.photo) return "complete";
	if (
		job.createItem &&
		job.itemId &&
		job.fieldsVersion > job.syncedFieldsVersion
	) {
		return "updateItem";
	}
	return null;
}

/** Exponential backoff with jitter: ~1 s, 2 s, 4 s … capped at `max`. */
export function backoffDelay(
	attempt: number,
	random: () => number = Math.random,
	base = 1000,
	max = 60_000,
): number {
	const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
	return Math.round(exp * (0.5 + random() / 2));
}

/** The part of the API client the queue uses. */
export type UploadApi = {
	items: Pick<ApiClient["items"], "create" | "update">;
	photos: Pick<ApiClient["photos"], "create" | "put" | "complete">;
};

export type QueueOptions = {
	store: QueueStore;
	prepare: (blob: Blob) => Promise<Prepared>;
	api?: UploadApi;
	concurrency?: number;
	/** Attempts per step before a transient failure becomes `failed`. */
	maxAttempts?: number;
	now?: () => number;
	random?: () => number;
	newId?: () => string;
};

export type QueueSnapshot = {
	jobs: readonly UploadJob[];
	/** Requests are being redirected to sign-in; reload to sign in again. */
	authRequired: boolean;
	/** Persisted jobs have been loaded. */
	loaded: boolean;
};

/** Thrown inside a step to force a retry regardless of the error type. */
class RetryableError extends Error {}

export class UploadQueue {
	private readonly store: QueueStore;
	private readonly prepareImage: (blob: Blob) => Promise<Prepared>;
	private readonly api: UploadApi;
	private readonly concurrency: number;
	private readonly maxAttempts: number;
	private readonly now: () => number;
	private readonly random: () => number;
	private readonly newId: () => string;

	private jobs = new Map<string, UploadJob>();
	private active = new Set<string>();
	private listeners = new Set<() => void>();
	private snapshot: QueueSnapshot = {
		jobs: [],
		authRequired: false,
		loaded: false,
	};
	private authRequired = false;
	private paused = false;
	private loading: Promise<void> | null = null;
	private loaded = false;
	private wakeTimer: ReturnType<typeof setTimeout> | null = null;
	private idleWaiters: (() => void)[] = [];
	/** Decoding full-size photos is memory-hungry on iOS: one at a time. */
	private prepareChain: Promise<unknown> = Promise.resolve();

	constructor(options: QueueOptions) {
		this.store = options.store;
		this.prepareImage = options.prepare;
		this.api = options.api ?? defaultApi;
		this.concurrency = options.concurrency ?? 2;
		this.maxAttempts = options.maxAttempts ?? 8;
		this.now = options.now ?? Date.now;
		this.random = options.random ?? Math.random;
		this.newId = options.newId ?? (() => crypto.randomUUID());
	}

	// Observing

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): QueueSnapshot => this.snapshot;

	get(id: string): UploadJob | undefined {
		return this.jobs.get(id);
	}

	private emit() {
		this.snapshot = {
			jobs: [...this.jobs.values()].sort(byCreated),
			authRequired: this.authRequired,
			loaded: this.loaded,
		};
		for (const listener of this.listeners) listener();
	}

	// Lifecycle

	/** Loads persisted jobs (once) and starts working. Safe to call repeatedly. */
	start(): Promise<void> {
		this.loading ??= (async () => {
			const stored = await this.store.loadJobs();
			for (const job of stored) {
				// Whatever was in flight when the page died runs again.
				const status = job.status === "running" ? "queued" : job.status;
				this.jobs.set(job.id, { ...job, status });
			}
			this.loaded = true;
			this.emit();
			this.pump();
		})();
		return this.loading;
	}

	/**
	 * Stops starting work: another user signed in on this device, and requests
	 * would go out with their session. Jobs stay persisted for `resume`.
	 */
	pause() {
		this.paused = true;
		if (this.wakeTimer) clearTimeout(this.wakeTimer);
		this.wakeTimer = null;
	}

	/** Undoes `pause` (the user is back). */
	resume() {
		if (!this.paused) return;
		this.paused = false;
		this.pump();
	}

	/**
	 * Run waiting jobs now: called when the page becomes visible, the network
	 * comes back, or the user taps retry. Also clears a sign-in pause (if the
	 * session is still expired the next request sets it again).
	 */
	kick() {
		const now = this.now();
		for (const job of this.jobs.values()) {
			if (job.status === "retrying") {
				this.jobs.set(job.id, { ...job, nextAttemptAt: now });
			}
		}
		if (this.authRequired) {
			this.authRequired = false;
		}
		this.emit();
		this.pump();
	}

	/** Resolves when nothing is running and nothing is due (tests, summaries). */
	whenIdle(): Promise<void> {
		if (this.isIdle()) return Promise.resolve();
		return new Promise((resolve) => this.idleWaiters.push(resolve));
	}

	dispose() {
		if (this.wakeTimer) clearTimeout(this.wakeTimer);
		this.wakeTimer = null;
		this.listeners.clear();
	}

	// Commands

	/** Persists a new capture (main photo of a new item) and starts uploading it. */
	async enqueueCapture(input: {
		blob: Blob;
		locationId: string;
		sessionId: string | null;
		fields?: ItemFields;
	}): Promise<UploadJob> {
		const job = this.newJob({
			locationId: input.locationId,
			sessionId: input.sessionId,
			kind: "main",
			createItem: true,
			parentJobId: null,
			itemId: null,
			fields: input.fields ?? {},
		});
		return this.add(job, input.blob);
	}

	/** Adds a label (or detail) photo to the item of an earlier capture. */
	async enqueueExtraPhoto(input: {
		blob: Blob;
		parentJobId: string;
		kind?: Exclude<PhotoKind, "main">;
	}): Promise<UploadJob> {
		const parent = this.jobs.get(input.parentJobId);
		if (!parent) {
			throw new Error("That capture is no longer in the queue");
		}
		const job = this.newJob({
			locationId: parent.locationId,
			sessionId: parent.sessionId,
			kind: input.kind ?? "label",
			createItem: false,
			parentJobId: parent.id,
			itemId: parent.itemId,
			fields: {},
		});
		return this.add(job, input.blob);
	}

	/** Edits the quick fields of a capture's item; PATCHes if it already exists. */
	async updateFields(id: string, fields: ItemFields): Promise<void> {
		const job = this.jobs.get(id);
		if (!job?.createItem) return;
		const next: UploadJob = {
			...job,
			fields: { ...job.fields, ...fields },
			fieldsVersion: job.fieldsVersion + 1,
		};
		if (next.status === "done") {
			next.status = "queued";
		}
		await this.save(next);
		this.pump();
	}

	/** Requeues a failed job from the step that failed. */
	async retry(id: string): Promise<void> {
		const job = this.jobs.get(id);
		if (!job || (job.status !== "failed" && job.status !== "retrying")) return;
		await this.save({
			...job,
			status: "queued",
			attempts: 0,
			nextAttemptAt: null,
			error: null,
		});
		this.pump();
	}

	/** Forgets a capture locally (and its extra photos). Server data stays. */
	async discard(id: string): Promise<void> {
		const ids = [
			id,
			...[...this.jobs.values()]
				.filter((job) => job.parentJobId === id)
				.map((job) => job.id),
		];
		for (const jobId of ids) {
			this.jobs.delete(jobId);
			await this.store.deleteJob(jobId);
		}
		this.emit();
		this.pump();
	}

	/** Drops finished jobs of a session once its summary has been seen. */
	async forgetFinished(sessionId: string | null): Promise<void> {
		const finished = [...this.jobs.values()].filter(
			(job) =>
				job.sessionId === sessionId &&
				job.status === "done" &&
				!this.hasUnfinishedChild(job.id),
		);
		for (const job of finished) {
			this.jobs.delete(job.id);
			await this.store.deleteJob(job.id);
		}
		this.emit();
	}

	// Internals

	private newJob(
		base: Pick<
			UploadJob,
			| "locationId"
			| "sessionId"
			| "kind"
			| "createItem"
			| "parentJobId"
			| "itemId"
			| "fields"
		>,
	): UploadJob {
		return {
			...base,
			id: this.newId(),
			createdAt: this.now(),
			fieldsVersion: 0,
			syncedFieldsVersion: 0,
			createItemRequest: null,
			prepared: false,
			contentType: null,
			size: null,
			preview: null,
			photoId: null,
			uploadUrl: null,
			uploadHeaders: null,
			uploaded: false,
			photo: null,
			status: "queued",
			attempts: 0,
			nextAttemptAt: null,
			error: null,
		};
	}

	private async add(job: UploadJob, blob: Blob): Promise<UploadJob> {
		// Blob first: a persisted job always has its photo.
		await this.store.putBlob(job.id, "original", blob);
		await this.save(job);
		this.pump();
		return job;
	}

	/** Replaces the job in memory, notifies, then persists. */
	private async save(job: UploadJob): Promise<void> {
		this.jobs.set(job.id, job);
		this.emit();
		await this.store.saveJob(job);
	}

	/** Applies changes to the current version of a job (it may have been edited). */
	private async patch(
		id: string,
		changes: Partial<UploadJob>,
	): Promise<UploadJob> {
		const current = this.jobs.get(id);
		if (!current) {
			throw new DiscardedError();
		}
		const next = { ...current, ...changes };
		await this.save(next);
		return next;
	}

	private hasUnfinishedChild(id: string): boolean {
		for (const job of this.jobs.values()) {
			if (job.parentJobId === id && job.status !== "done") return true;
		}
		return false;
	}

	/** A label photo cannot be created before its item exists. */
	private isBlocked(job: UploadJob): boolean {
		if (job.itemId || !job.parentJobId) return false;
		if (nextStep(job) !== "createPhoto") return false;
		return !this.jobs.get(job.parentJobId)?.itemId;
	}

	private isDue(job: UploadJob, now: number): boolean {
		if (job.status === "queued") return true;
		return job.status === "retrying" && (job.nextAttemptAt ?? 0) <= now;
	}

	private isIdle(): boolean {
		if (this.active.size > 0) return false;
		if (this.authRequired) return true;
		const now = this.now();
		for (const job of this.jobs.values()) {
			if (this.isDue(job, now) && !this.isBlocked(job)) return false;
		}
		return true;
	}

	private pump() {
		if (!this.loaded || this.paused) return;
		if (!this.authRequired) {
			const now = this.now();
			for (const job of this.snapshot.jobs) {
				if (this.active.size >= this.concurrency) break;
				const current = this.jobs.get(job.id);
				if (!current || this.active.has(current.id)) continue;
				if (!this.isDue(current, now) || this.isBlocked(current)) continue;
				this.active.add(current.id);
				void this.run(current.id);
			}
		}
		this.scheduleWake();
		if (this.isIdle()) {
			const waiters = this.idleWaiters;
			this.idleWaiters = [];
			for (const resolve of waiters) resolve();
		}
	}

	private scheduleWake() {
		if (this.wakeTimer) clearTimeout(this.wakeTimer);
		this.wakeTimer = null;
		if (this.authRequired) return;
		let earliest = Number.POSITIVE_INFINITY;
		for (const job of this.jobs.values()) {
			if (job.status === "retrying" && job.nextAttemptAt !== null) {
				earliest = Math.min(earliest, job.nextAttemptAt);
			}
		}
		if (earliest === Number.POSITIVE_INFINITY) return;
		const delay = Math.max(0, earliest - this.now());
		this.wakeTimer = setTimeout(() => {
			this.wakeTimer = null;
			this.pump();
		}, delay);
	}

	private async run(id: string): Promise<void> {
		try {
			await this.patch(id, { status: "running" });
			for (;;) {
				const job = this.jobs.get(id);
				if (!job) return;
				const step = nextStep(job);
				if (!step) {
					await this.finish(job);
					const after = this.jobs.get(id);
					if (after && nextStep(after)) {
						// Edited while finishing: keep going.
						await this.patch(id, { status: "running" });
						continue;
					}
					return;
				}
				if (this.isBlocked(job)) {
					await this.patch(id, { status: "queued" });
					return;
				}
				await this.perform(step, job);
			}
		} catch (err) {
			await this.fail(id, err);
		} finally {
			this.active.delete(id);
			this.pump();
		}
	}

	private async fail(id: string, err: unknown) {
		const job = this.jobs.get(id);
		if (!job || err instanceof DiscardedError) return;
		if (isSignInExpired(err)) {
			this.authRequired = true;
			await this.patch(id, { status: "queued", error: err.message });
			return;
		}
		const attempts = job.attempts + 1;
		const retry =
			(err instanceof RetryableError || isRetryable(err)) &&
			attempts < this.maxAttempts;
		await this.patch(id, {
			status: retry ? "retrying" : "failed",
			attempts,
			nextAttemptAt: retry
				? this.now() + backoffDelay(attempts, this.random)
				: null,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	private async finish(job: UploadJob) {
		await this.patch(job.id, {
			status: "done",
			attempts: 0,
			nextAttemptAt: null,
			error: null,
		});
		await this.store.deleteBlob(job.id, "upload");
		await this.store.deleteBlob(job.id, "original");
	}

	private async perform(step: Step, job: UploadJob): Promise<void> {
		const ok = { attempts: 0, error: null } as const;
		switch (step) {
			case "prepare": {
				const original = await this.store.getBlob(job.id, "original");
				if (!original) {
					throw new Error("The photo is no longer stored on this device");
				}
				const run = this.prepareChain.then(() => this.prepareImage(original));
				this.prepareChain = run.catch(() => undefined);
				const { upload, preview } = await run;
				await this.store.putBlob(job.id, "upload", upload);
				await this.patch(job.id, {
					...ok,
					prepared: true,
					preview,
					contentType: upload.type || "image/jpeg",
					size: upload.size,
				});
				await this.store.deleteBlob(job.id, "original");
				return;
			}
			case "createItem": {
				// Frozen (and persisted) before the first attempt: a retry after a
				// lost response must send the same body with the same key, or the
				// server rejects it; fields edited meanwhile are PATCHed after.
				let request = job.createItemRequest;
				if (!request) {
					request = {
						body: {
							locationId: job.locationId,
							...(job.sessionId ? { sessionId: job.sessionId } : {}),
							...present(job.fields),
						},
						fieldsVersion: job.fieldsVersion,
					};
					await this.patch(job.id, { createItemRequest: request });
				}
				const item = await this.api.items.create(request.body, {
					idempotencyKey: `item-${job.id}`,
				});
				await this.patch(job.id, {
					...ok,
					itemId: item.id,
					syncedFieldsVersion: request.fieldsVersion,
				});
				return;
			}
			case "createPhoto": {
				const itemId =
					job.itemId ??
					(job.parentJobId ? this.jobs.get(job.parentJobId)?.itemId : null) ??
					undefined;
				const { photo, uploadUrl, uploadHeaders } =
					await this.api.photos.create(
						{
							itemId,
							kind: job.kind,
							contentType: job.contentType ?? "image/jpeg",
							size: job.size ?? 0,
						},
						// Same key after an expired presigned URL too: the server replays
						// the same photo with a freshly presigned PUT.
						{ idempotencyKey: `photo-${job.id}` },
					);
				await this.patch(job.id, {
					...ok,
					itemId: itemId ?? null,
					photoId: photo.id,
					uploadUrl,
					uploadHeaders,
				});
				return;
			}
			case "upload": {
				const blob = await this.store.getBlob(job.id, "upload");
				if (!blob || !job.uploadUrl) {
					throw new Error("The photo is no longer stored on this device");
				}
				try {
					await this.api.photos.put(
						job.uploadUrl,
						job.uploadHeaders ?? {},
						blob,
					);
				} catch (err) {
					if (isApiError(err, 400) || isApiError(err, 403)) {
						// The presigned URL expired (e.g. queued offline for hours):
						// request a fresh photo upload on the next attempt.
						await this.patch(job.id, {
							photoId: null,
							uploadUrl: null,
							uploadHeaders: null,
						});
						throw new RetryableError(err.message);
					}
					throw err;
				}
				await this.patch(job.id, { ...ok, uploaded: true });
				return;
			}
			case "complete": {
				if (!job.photoId) throw new Error("No photo to complete");
				let photo: Awaited<ReturnType<UploadApi["photos"]["complete"]>>;
				try {
					photo = await this.api.photos.complete(job.photoId);
				} catch (err) {
					if (isApiError(err, 422)) {
						// The server cannot find the object: upload it again.
						await this.patch(job.id, { uploaded: false });
						throw new RetryableError(err.message);
					}
					throw err;
				}
				await this.patch(job.id, { ...ok, photo });
				return;
			}
			case "updateItem": {
				if (!job.itemId) throw new Error("No item to update");
				const version = job.fieldsVersion;
				await this.api.items.update(job.itemId, {
					name: job.fields.name?.trim() || null,
					categoryId: job.fields.categoryId ?? null,
				});
				await this.patch(job.id, { ...ok, syncedFieldsVersion: version });
				return;
			}
		}
	}
}

class DiscardedError extends Error {}

function byCreated(a: UploadJob, b: UploadJob): number {
	return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/** Only fields with a value go into POST /api/items. */
function present(fields: ItemFields): ItemFields {
	const out: ItemFields = {};
	const name = fields.name?.trim();
	if (name) out.name = name;
	if (fields.categoryId) out.categoryId = fields.categoryId;
	return out;
}
