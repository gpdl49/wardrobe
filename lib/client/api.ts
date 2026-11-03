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
	kind?: LocationKind;
	q?: string;
	/** Not in the contract: include archived locations. */
	archived?: boolean;
}

export interface CreateLocationInput {
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

/** Item fields an analysis can fill (keys of ItemSuggestion except labelText). */
export type SuggestionField = Exclude<keyof ItemSuggestion, "labelText">;

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
}

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

export function createApiClient(options: ApiClientOptions = {}) {
	const baseUrl = options.baseUrl ?? "/api";
	const doFetch: typeof fetch = (...args) =>
		(options.fetch ?? globalThis.fetch)(...args);

	async function request<T>(
		method: string,
		path: string,
		{ query, body, signal }: RequestOptions = {},
	): Promise<T> {
		const headers: Record<string, string> = { Accept: "application/json" };
		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
		}
		const response = await doFetch(`${baseUrl}${path}${toQueryString(query)}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal,
			credentials: "same-origin",
		});
		if (!response.ok) {
			throw await toApiError(response);
		}
		if (response.status === 204) {
			return undefined as T;
		}
		const type = response.headers.get("content-type") ?? "";
		if (!type.includes("json")) {
			// Most likely oauth2-proxy's sign-in page after the session expired.
			throw new ApiError(
				response.redirected ? 401 : response.status,
				response.redirected ? "unauthorized" : "bad_response",
				response.redirected
					? "Your session has expired. Reload the page to sign in again."
					: `Unexpected ${type || "empty"} response from ${path}`,
			);
		}
		return (await response.json()) as T;
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
			getByCode: (code: string, signal?: AbortSignal) =>
				request<LocationDto>("GET", `/locations/by-code/${enc(code)}`, {
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
			list: (signal?: AbortSignal) =>
				request<TagCountDto[]>("GET", "/tags", { signal }),
		},

		items: {
			list: (query: ItemsQuery = {}, signal?: AbortSignal) =>
				request<ItemListDto>("GET", "/items", {
					query: { ...query },
					signal,
				}),
			get: (id: string, signal?: AbortSignal) =>
				request<ItemDetailDto>("GET", `/items/${enc(id)}`, { signal }),
			create: (input: ItemInput) =>
				request<ItemSummaryDto>("POST", "/items", { body: input }),
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
			create: (input: CreatePhotoInput) =>
				request<PhotoUploadDto>("POST", "/photos", { body: input }),
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
				const put = await doFetch(uploadUrl, {
					method: "PUT",
					headers: uploadHeaders,
					body: file,
				});
				if (!put.ok) {
					throw new ApiError(
						put.status,
						"upload_failed",
						`Uploading the photo failed (${put.status})`,
					);
				}
				return request<PhotoDto>("POST", `/photos/${enc(photo.id)}/complete`);
			},
		},

		sessions: {
			get: (id: string, signal?: AbortSignal) =>
				request<PackingSessionDetailDto>("GET", `/sessions/${enc(id)}`, {
					signal,
				}),
			start: (mode: SessionMode, locationId: string) =>
				request<PackingSessionDto>("POST", "/sessions", {
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
