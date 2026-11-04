/**
 * Typed browser client for the HTTP API (docs/wardrobe.md "HTTP API"). Every
 * response shape comes from lib/api/types.ts; every non-2xx response is thrown
 * as an ApiError carrying the contract's `{error, message}` and the status.
 *
 * Runs in the browser behind oauth2-proxy, so requests are same-origin and the
 * session cookie rides along; nothing here is server-only.
 */

import type {
	AnalysisDto,
	AnalysisKind,
	CategoryDto,
	ItemColor,
	ItemDetailDto,
	ItemListDto,
	ItemStatus,
	ItemSuggestion,
	ItemSummaryDto,
	LocationDetailDto,
	LocationDto,
	LocationKind,
	MeDto,
	PackingSessionDetailDto,
	PackingSessionDto,
	PhotoDto,
	PhotoKind,
	PhotoUploadDto,
	PhotoVariant,
	Season,
	SessionMode,
	ShareAccess,
	ShareDto,
	SharedWithMeDto,
	TagCountDto,
} from "@/lib/api/types";

/** A non-2xx API response (or a response that is not the JSON we expected). */
export class ApiError extends Error {
	/** Stable machine code from the body, e.g. `not_found`, `conflict`. */
	readonly error: string;
	readonly status: number;

	constructor(status: number, error: string, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.error = error;
	}
}

export function isApiError(err: unknown, status?: number): err is ApiError {
	return (
		err instanceof ApiError && (status === undefined || err.status === status)
	);
}

/**
 * The request was turned away for want of a sign-in: a 401, or oauth2-proxy
 * redirecting an expired session to sign-in (which the client reports as a
 * 401). Reloading the page signs in again; retrying the request does not help.
 */
export function isSignInExpired(err: unknown): err is ApiError {
	return isApiError(err, 401);
}

/**
 * Worth retrying with the same request (and Idempotency-Key): network
 * failures and timeouts (fetch rejects with a TypeError, or a DOMException
 * when aborted), 408/425/429, 5xx, and a 409 `idempotency_in_progress` (an
 * earlier attempt with the same key is still running on the server). Every
 * other API error, including an expired sign-in, is permanent.
 */
export function isRetryable(err: unknown): boolean {
	if (err instanceof ApiError) {
		return (
			err.status === 0 ||
			(err.status === 409 && err.error === "idempotency_in_progress") ||
			err.status === 408 ||
			err.status === 425 ||
			err.status === 429 ||
			err.status >= 500
		);
	}
	return (
		err instanceof TypeError ||
		(err instanceof DOMException &&
			(err.name === "AbortError" || err.name === "TimeoutError"))
	);
}

const SIGN_IN_EXPIRED =
	"Your session has expired. Reload the page to sign in again.";

function signInExpired(): ApiError {
	return new ApiError(401, "unauthorized", SIGN_IN_EXPIRED);
}

/** Codes for responses without a contract body (proxy errors, crashes). */
const FALLBACK_CODES: Record<number, string> = {
	400: "bad_request",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	409: "conflict",
	422: "unprocessable",
	500: "internal",
};

// ---------------------------------------------------------------------------
// Request inputs (the response types live in lib/api/types.ts)
// ---------------------------------------------------------------------------

export interface LocationsQuery {
	/** Whose wardrobe (a user id); defaults to the caller's. */
	owner?: string;
	kind?: LocationKind;
	q?: string;
	/** Not in the contract: include archived locations. */
	archived?: boolean;
}

export interface CreateLocationInput {
	/** Whose wardrobe; defaults to the parent's owner, else the caller. */
	ownerId?: string;
	kind: LocationKind;
	code: string;
	name: string;
	notes?: string | null;
	parentId?: string | null;
}

export interface UpdateLocationInput {
	kind?: LocationKind;
	code?: string;
	name?: string;
	notes?: string | null;
	parentId?: string | null;
	/** ISO timestamp to archive, null to unarchive. */
	archivedAt?: string | null;
}

export interface CreateCategoryInput {
	name: string;
	parentId?: string | null;
	sortOrder?: number;
	slug?: string;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export interface ItemsQuery {
	/** Whose wardrobe (a user id); defaults to the caller's. */
	owner?: string;
	/** Location id or code. */
	location?: string;
	/** Category id or slug; includes its subcategories. */
	category?: string;
	/** Tag name. */
	tag?: string;
	season?: Season;
	status?: ItemStatus;
	/** Colour name from the palette, e.g. "navy". */
	color?: string;
	q?: string;
	cursor?: string;
	limit?: number;
}

/** Editable item fields (POST /items, PATCH /items/{id}). */
export interface ItemInput {
	/** POST only: whose wardrobe; defaults to the location's owner, else the caller. */
	ownerId?: string;
	name?: string | null;
	categoryId?: string | null;
	brand?: string | null;
	size?: string | null;
	colors?: ItemColor[];
	pattern?: string | null;
	material?: string | null;
	seasons?: Season[];
	status?: ItemStatus;
	locationId?: string | null;
	notes?: string | null;
	tags?: string[];
	/** PATCH only; must be one of the item's own photos. */
	coverPhotoId?: string | null;
	/** Packing session a location change belongs to (recorded on the Movement). */
	sessionId?: string;
}

export interface MoveItemsInput {
	itemIds: string[];
	/** null takes the items out of any location. */
	toLocationId: string | null;
	sessionId?: string;
}

export interface CreatePhotoInput {
	itemId?: string | null;
	kind: PhotoKind;
	contentType: string;
	size: number;
}

/**
 * Fields of an analysis that can be applied. Tags are added to the item's,
 * label text is appended to its notes, the rest replace the item's value.
 */
export type SuggestionField = keyof ItemSuggestion;

export interface CreateShareInput {
	/** Email or username of someone who has signed in at least once. */
	grantee: string;
	access: ShareAccess;
	/** Omitted: the whole wardrobe. */
	locationId?: string;
}

export interface RerunAnalysisInput {
	/** Defaults to every kind the server can run. */
	kinds?: AnalysisKind[];
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
	query?: Query;
	body?: unknown;
	signal?: AbortSignal;
	/**
	 * Sent as `Idempotency-Key` (POST /items, /photos and /sessions honour it).
	 * A retry must send the same key and the same body: the server replays the
	 * first response, and 422s (`idempotency_key_reused`) when the body differs.
	 */
	idempotencyKey?: string;
}

/** Per-call options of the create calls that honour `Idempotency-Key`. */
export type CreateOptions = Pick<RequestOptions, "idempotencyKey" | "signal">;

export function toQueryString(query: Query | undefined): string {
	if (!query) {
		return "";
	}
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") {
			continue;
		}
		params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

export interface ApiClientOptions {
	/** Prefix for every path; defaults to `/api` (same origin). */
	baseUrl?: string;
	/** Defaults to the global fetch, looked up per call (so tests can stub it). */
	fetch?: typeof fetch;
}

/**
 * oauth2-proxy answers a request with an expired session by redirecting to
 * sign-in. API calls fetch with `redirect: "manual"`, so the browser hands
 * back an opaque redirect (status 0) instead of chasing a cross-origin
 * redirect to the identity provider (which fails like a network error);
 * runtimes without opaque responses return the 3xx itself. A fetch that did
 * follow the redirect ends on an HTML page, flagged `redirected`.
 */
function isSignInRedirect(response: Response): boolean {
	return (
		response.type === "opaqueredirect" ||
		(response.status >= 300 && response.status < 400)
	);
}

export function createApiClient(options: ApiClientOptions = {}) {
	const baseUrl = options.baseUrl ?? "/api";
	const doFetch: typeof fetch = (...args) =>
		(options.fetch ?? globalThis.fetch)(...args);

	async function request<T>(
		method: string,
		path: string,
		{ query, body, signal, idempotencyKey }: RequestOptions = {},
	): Promise<T> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
		}
		if (idempotencyKey !== undefined) {
			headers["Idempotency-Key"] = idempotencyKey;
		}
		const response = await doFetch(`${baseUrl}${path}${toQueryString(query)}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal,
			credentials: "same-origin",
			redirect: "manual",
		});
		if (isSignInRedirect(response)) {
			throw signInExpired();
		}
		if (!response.ok) {
			throw await toApiError(response);
		}
		if (response.status === 204) {
			return undefined as T;
		}
		const type = response.headers.get("content-type") ?? "";
		if (!type.includes("json")) {
			if (response.redirected) {
				// oauth2-proxy's sign-in page, reached by following its redirect.
				throw signInExpired();
			}
			throw new ApiError(
				response.status,
				"bad_response",
				`Unexpected ${type || "empty"} response from ${path}`,
			);
		}
		return (await response.json()) as T;
	}

	/**
	 * PUT bytes to a presigned S3 URL (from POST /photos) with exactly its
	 * `uploadHeaders`. Cross-origin, so no cookies; a failure is an ApiError
	 * `upload_failed` with S3's status (400/403 once the URL has expired).
	 */
	async function putObject(
		uploadUrl: string,
		uploadHeaders: Record<string, string>,
		file: Blob,
		signal?: AbortSignal,
	): Promise<void> {
		const response = await doFetch(uploadUrl, {
			method: "PUT",
			headers: uploadHeaders,
			body: file,
			signal,
		});
		if (!response.ok) {
			throw new ApiError(
				response.status,
				"upload_failed",
				`Uploading the photo failed (${response.status})`,
			);
		}
	}

	const enc = encodeURIComponent;

	return {
		request,

		health: async (): Promise<string> => {
			const response = await doFetch(`${baseUrl}/healthz`);
			if (!response.ok) {
				throw await toApiError(response);
			}
			return response.text();
		},
		me: () => request<MeDto>("GET", "/me"),

		locations: {
			list: (query: LocationsQuery = {}, signal?: AbortSignal) =>
				request<LocationDto[]>("GET", "/locations", {
					query: { ...query },
					signal,
				}),
			get: (id: string, signal?: AbortSignal) =>
				request<LocationDetailDto>("GET", `/locations/${enc(id)}`, {
					signal,
				}),
			/** Looks only in `owner`'s wardrobe (default: the caller's). */
			getByCode: (
				code: string,
				{ owner, signal }: { owner?: string; signal?: AbortSignal } = {},
			) =>
				request<LocationDto>("GET", `/locations/by-code/${enc(code)}`, {
					query: { owner },
					signal,
				}),
			create: (input: CreateLocationInput) =>
				request<LocationDto>("POST", "/locations", { body: input }),
			update: (id: string, input: UpdateLocationInput) =>
				request<LocationDto>("PATCH", `/locations/${enc(id)}`, {
					body: input,
				}),
			delete: (id: string) => request<void>("DELETE", `/locations/${enc(id)}`),
		},

		categories: {
			list: (signal?: AbortSignal) =>
				request<CategoryDto[]>("GET", "/categories", { signal }),
			create: (input: CreateCategoryInput) =>
				request<CategoryDto>("POST", "/categories", { body: input }),
			update: (id: string, input: UpdateCategoryInput) =>
				request<CategoryDto>("PATCH", `/categories/${enc(id)}`, {
					body: input,
				}),
			delete: (id: string) => request<void>("DELETE", `/categories/${enc(id)}`),
		},

		tags: {
			list: (query: { owner?: string } = {}, signal?: AbortSignal) =>
				request<TagCountDto[]>("GET", "/tags", { query, signal }),
		},

		shares: {
			/** Shares the caller owns. */
			list: (signal?: AbortSignal) =>
				request<ShareDto[]>("GET", "/shares", { signal }),
			/** 422 for an unknown grantee or yourself, 409 for a duplicate. */
			create: (input: CreateShareInput) =>
				request<ShareDto>("POST", "/shares", { body: input }),
			update: (id: string, access: ShareAccess) =>
				request<ShareDto>("PATCH", `/shares/${enc(id)}`, { body: { access } }),
			delete: (id: string) => request<void>("DELETE", `/shares/${enc(id)}`),
			sharedWithMe: (signal?: AbortSignal) =>
				request<SharedWithMeDto[]>("GET", "/shared-with-me", { signal }),
		},

		items: {
			list: (query: ItemsQuery = {}, signal?: AbortSignal) =>
				request<ItemListDto>("GET", "/items", {
					query: { ...query },
					signal,
				}),
			get: (id: string, signal?: AbortSignal) =>
				request<ItemDetailDto>("GET", `/items/${enc(id)}`, { signal }),
			create: (input: ItemInput, options: CreateOptions = {}) =>
				request<ItemSummaryDto>("POST", "/items", {
					...options,
					body: input,
				}),
			update: (id: string, input: ItemInput) =>
				request<ItemSummaryDto>("PATCH", `/items/${enc(id)}`, {
					body: input,
				}),
			delete: (id: string) => request<void>("DELETE", `/items/${enc(id)}`),
			move: (input: MoveItemsInput) =>
				request<{ moved: number }>("POST", "/items/move", { body: input }),
		},

		analyses: {
			/** Newest first. */
			list: (itemId: string, signal?: AbortSignal) =>
				request<AnalysisDto[]>("GET", `/items/${enc(itemId)}/analyses`, {
					signal,
				}),
			/**
			 * Queues fresh analyses of the item's photos (202). 409 when vision is
			 * disabled or the item has no ready photo.
			 */
			run: (itemId: string, input: RerunAnalysisInput = {}) =>
				request<AnalysisDto[]>("POST", `/items/${enc(itemId)}/analyses`, {
					body: input,
				}),
			/**
			 * Copies the chosen suggestion fields onto the item and returns it.
			 * 409 if the analysis is not done, 422 if its category was deleted.
			 */
			apply: (itemId: string, analysisId: string, fields: SuggestionField[]) =>
				request<ItemDetailDto>(
					"POST",
					`/items/${enc(itemId)}/analyses/${enc(analysisId)}/apply`,
					{ body: { fields } },
				),
		},

		photos: {
			/**
			 * `/api/photos/{id}/{variant}` (302 to a presigned GET); display and
			 * thumb are 404 until the photo is ready.
			 */
			url: (photo: Pick<PhotoDto, "id">, variant: PhotoVariant) =>
				`${baseUrl}/photos/${enc(photo.id)}/${variant}`,
			create: (input: CreatePhotoInput, options: CreateOptions = {}) =>
				request<PhotoUploadDto>("POST", "/photos", {
					...options,
					body: input,
				}),
			/** PUT the bytes to the presigned URL returned by `create`. */
			put: putObject,
			complete: (id: string) =>
				request<PhotoDto>("POST", `/photos/${enc(id)}/complete`),
			/** Assign a photo to an item (or unassign with null) or change its kind. */
			update: (
				id: string,
				input: { itemId?: string | null; kind?: PhotoKind },
			) => request<PhotoDto>("PATCH", `/photos/${enc(id)}`, { body: input }),
			delete: (id: string) => request<void>("DELETE", `/photos/${enc(id)}`),
			/**
			 * The whole upload: create, PUT the bytes to the presigned URL, then
			 * complete (which queues renditions and analysis).
			 */
			upload: async (
				file: Blob,
				input: Omit<CreatePhotoInput, "contentType" | "size">,
			): Promise<PhotoDto> => {
				const { photo, uploadUrl, uploadHeaders } =
					await request<PhotoUploadDto>("POST", "/photos", {
						body: {
							...input,
							contentType: file.type || "application/octet-stream",
							size: file.size,
						},
					});
				await putObject(uploadUrl, uploadHeaders, file);
				return request<PhotoDto>("POST", `/photos/${enc(photo.id)}/complete`);
			},
		},

		sessions: {
			get: (id: string, signal?: AbortSignal) =>
				request<PackingSessionDetailDto>("GET", `/sessions/${enc(id)}`, {
					signal,
				}),
			start: (
				mode: SessionMode,
				locationId: string,
				options: CreateOptions = {},
			) =>
				request<PackingSessionDto>("POST", "/sessions", {
					...options,
					body: { mode, locationId },
				}),
			end: (id: string) =>
				request<PackingSessionDto>("POST", `/sessions/${enc(id)}/end`),
		},
	};
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The app's client: same-origin `/api`. */
export const api = createApiClient();

async function toApiError(response: Response): Promise<ApiError> {
	const fallback = FALLBACK_CODES[response.status] ?? "http_error";
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		body = undefined;
	}
	if (
		body &&
		typeof body === "object" &&
		"error" in body &&
		typeof body.error === "string"
	) {
		const message =
			"message" in body && typeof body.message === "string"
				? body.message
				: response.statusText || body.error;
		return new ApiError(response.status, body.error, message);
	}
	return new ApiError(
		response.status,
		fallback,
		response.statusText || `Request failed (${response.status})`,
	);
}
