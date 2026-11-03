import type {
	CategoryDto,
	ItemDetailDto,
	ItemSummaryDto,
	LocationDetailDto,
	LocationDto,
	LocationKind,
	PackingSessionDetailDto,
	PackingSessionDto,
	PhotoDto,
	PhotoKind,
	PhotoUploadDto,
	SessionMode,
} from "@/lib/api/types";

/**
 * Thin fetch calls for the pack/unpack screens, typed with lib/api/types.ts.
 * Deliberately minimal: they map 1:1 onto docs/wardrobe.md "HTTP API" and
 * are meant to be swapped for the shared client in lib/client/api.ts.
 */

/** Non-2xx API response; `code` is the contract's `error` field. */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}

/**
 * oauth2-proxy answers an expired session with a redirect to the identity
 * provider, which a same-origin fetch cannot follow. Seen as an opaque
 * redirect (we fetch with `redirect: "manual"`) or a 401.
 */
export class AuthRequiredError extends Error {
	constructor() {
		super("Your sign-in has expired");
		this.name = "AuthRequiredError";
	}
}

/** Network failures, timeouts, throttling and server errors are worth retrying. */
export function isRetryable(err: unknown): boolean {
	if (err instanceof HttpError) {
		return (
			err.status === 0 ||
			err.status === 408 ||
			err.status === 425 ||
			err.status === 429 ||
			err.status >= 500
		);
	}
	if (err instanceof AuthRequiredError) {
		return false;
	}
	// fetch rejects with a TypeError when the network is down; aborts too.
	return (
		err instanceof TypeError ||
		(err instanceof DOMException &&
			(err.name === "AbortError" || err.name === "TimeoutError"))
	);
}

export function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

type RequestOptions = {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const headers: Record<string, string> = {
		accept: "application/json",
		...options.headers,
	};
	if (options.body !== undefined) {
		headers["content-type"] = "application/json";
	}
	const response = await fetch(path, {
		method: options.method ?? "GET",
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		credentials: "same-origin",
		redirect: "manual",
		signal: options.signal,
	});
	if (response.type === "opaqueredirect" || response.status === 401) {
		throw new AuthRequiredError();
	}
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string;
			message?: string;
		} | null;
		throw new HttpError(
			response.status,
			body?.error ?? "http_error",
			body?.message ?? `Request failed (${response.status})`,
		);
	}
	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
}

const enc = encodeURIComponent;

// Locations

export function listLocations(
	params: { kind?: LocationKind; q?: string; archived?: boolean } = {},
): Promise<LocationDto[]> {
	const query = new URLSearchParams();
	if (params.kind) query.set("kind", params.kind);
	if (params.q) query.set("q", params.q);
	if (params.archived) query.set("archived", "true");
	const qs = query.toString();
	return api(`/api/locations${qs ? `?${qs}` : ""}`);
}

export function getLocation(id: string): Promise<LocationDetailDto> {
	return api(`/api/locations/${enc(id)}`);
}

export function getLocationByCode(code: string): Promise<LocationDto> {
	return api(`/api/locations/by-code/${enc(code)}`);
}

export function createLocation(input: {
	kind: LocationKind;
	code: string;
	name: string;
}): Promise<LocationDto> {
	return api("/api/locations", { method: "POST", body: input });
}

// Categories

export function listCategories(): Promise<CategoryDto[]> {
	return api("/api/categories");
}

// Items

/** Quick fields editable from the capture loop. */
export type ItemFields = {
	name?: string | null;
	categoryId?: string | null;
};

export function createItem(
	/** `sessionId` is recorded on the item's first Movement. */
	input: ItemFields & { locationId: string; sessionId?: string },
	idempotencyKey?: string,
): Promise<ItemSummaryDto> {
	return api("/api/items", {
		method: "POST",
		body: input,
		headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
	});
}

export function updateItem(
	id: string,
	input: ItemFields,
): Promise<ItemSummaryDto> {
	return api(`/api/items/${enc(id)}`, { method: "PATCH", body: input });
}

export function getItem(id: string): Promise<ItemDetailDto> {
	return api(`/api/items/${enc(id)}`);
}

export function moveItems(input: {
	itemIds: string[];
	toLocationId: string;
	sessionId?: string;
}): Promise<{ moved: number }> {
	return api("/api/items/move", { method: "POST", body: input });
}

// Photos

export function createPhoto(
	input: {
		itemId?: string;
		kind: PhotoKind;
		contentType: string;
		size: number;
	},
	idempotencyKey?: string,
): Promise<PhotoUploadDto> {
	return api("/api/photos", {
		method: "POST",
		body: input,
		headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
	});
}

/** PUT the bytes to the presigned URL (S3, cross-origin, no cookies). */
export async function putObject(
	uploadUrl: string,
	uploadHeaders: Record<string, string>,
	body: Blob,
	signal?: AbortSignal,
): Promise<void> {
	const response = await fetch(uploadUrl, {
		method: "PUT",
		headers: uploadHeaders,
		body,
		signal,
	});
	if (!response.ok) {
		throw new HttpError(
			response.status,
			"upload_failed",
			`Upload failed (${response.status})`,
		);
	}
}

export function completePhoto(id: string): Promise<PhotoDto> {
	return api(`/api/photos/${enc(id)}/complete`, { method: "POST" });
}

export function deletePhoto(id: string): Promise<void> {
	return api(`/api/photos/${enc(id)}`, { method: "DELETE" });
}

// Sessions

export function startSession(input: {
	mode: SessionMode;
	locationId: string;
}): Promise<PackingSessionDto> {
	return api("/api/sessions", { method: "POST", body: input });
}

export function endSession(id: string): Promise<PackingSessionDto> {
	return api(`/api/sessions/${enc(id)}/end`, { method: "POST" });
}

/** Not in the contract: the session with its location and items. */
export function getSession(id: string): Promise<PackingSessionDetailDto> {
	return api(`/api/sessions/${enc(id)}`);
}
