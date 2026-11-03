/**
 * JSON shapes of the HTTP API (docs/wardrobe.md "HTTP API"). The contract
 * between route handlers and the UI: services serialise to these, client code
 * consumes them. Dates are ISO 8601 strings on the wire. Change here first.
 */

export type LocationKind = "bag" | "suitcase" | "closet" | "drawer" | "other";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type ItemStatus = "active" | "stored" | "lent" | "donated" | "discarded";
export type PhotoKind = "main" | "label" | "detail";
export type PhotoStatus = "pending" | "processing" | "ready" | "failed";
export type PhotoVariant = "original" | "display" | "thumb";
export type SessionMode = "pack" | "unpack";
export type AnalysisKind = "colors" | "vision";
export type AnalysisStatus = "queued" | "running" | "done" | "failed";

export interface ApiError {
	error: string;
	message: string;
}

export interface LocationDto {
	id: string;
	kind: LocationKind;
	code: string;
	name: string;
	notes: string | null;
	parentId: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
	itemCount: number;
}

/** GET /api/locations/{id} */
export interface LocationDetailDto extends LocationDto {
	items: ItemSummaryDto[];
	children: LocationDto[];
}

/** Compact reference embedded in items and movements. */
export interface LocationRef {
	id: string;
	kind: LocationKind;
	code: string;
	name: string;
}

export interface CategoryDto {
	id: string;
	name: string;
	slug: string;
	parentId: string | null;
	sortOrder: number;
}

export interface CategoryRef {
	id: string;
	name: string;
	slug: string;
}

/** GET /api/tags */
export interface TagCountDto {
	name: string;
	count: number;
}

export interface ItemColor {
	/** Human name from the palette, e.g. "navy". */
	name: string;
	/** #rrggbb */
	hex: string;
	/** Share of the garment's pixels, 0..1; the list is sorted by share desc. */
	share: number;
}

export interface PhotoDto {
	id: string;
	itemId: string | null;
	kind: PhotoKind;
	status: PhotoStatus;
	contentType: string;
	size: number;
	width: number | null;
	height: number | null;
	blurhash: string | null;
	createdAt: string;
	/** `/api/photos/{id}/{variant}`; display/thumb are only meaningful when status is ready. */
	urls: Record<PhotoVariant, string>;
}

/** Item in lists (GET /api/items, location contents). */
export interface ItemSummaryDto {
	id: string;
	name: string | null;
	category: CategoryRef | null;
	brand: string | null;
	size: string | null;
	colors: ItemColor[];
	pattern: string | null;
	material: string | null;
	seasons: Season[];
	status: ItemStatus;
	location: LocationRef | null;
	notes: string | null;
	tags: string[];
	coverPhoto: PhotoDto | null;
	createdAt: string;
	updatedAt: string;
}

export interface MovementDto {
	id: string;
	from: LocationRef | null;
	to: LocationRef | null;
	sessionId: string | null;
	at: string;
}

/** Fields an analysis may suggest, all optional. */
export interface ItemSuggestion {
	name?: string;
	/** Slug of an existing category. */
	categorySlug?: string;
	brand?: string;
	size?: string;
	colors?: ItemColor[];
	pattern?: string;
	material?: string;
	seasons?: Season[];
	tags?: string[];
	/** Free text read from a care/brand label. */
	labelText?: string;
}

export interface AnalysisDto {
	id: string;
	itemId: string;
	photoId: string | null;
	kind: AnalysisKind;
	model: string | null;
	status: AnalysisStatus;
	/** Present when status is done. */
	result: ItemSuggestion | null;
	error: string | null;
	appliedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

/** GET /api/items/{id} */
export interface ItemDetailDto extends ItemSummaryDto {
	photos: PhotoDto[];
	movements: MovementDto[];
	analyses: AnalysisDto[];
}

/** GET /api/items */
export interface ItemListDto {
	items: ItemSummaryDto[];
	nextCursor: string | null;
}

/** POST /api/photos */
export interface PhotoUploadDto {
	photo: PhotoDto;
	uploadUrl: string;
	uploadHeaders: Record<string, string>;
}

export interface PackingSessionDto {
	id: string;
	mode: SessionMode;
	locationId: string;
	startedAt: string;
	endedAt: string | null;
}

export interface MeDto {
	sub: string;
	email: string | null;
	username: string | null;
	groups: string[];
}

/** GET /api/sessions/{id}: the session and the items moved in it. */
export interface PackingSessionDetailDto extends PackingSessionDto {
	location: LocationRef;
	items: ItemSummaryDto[];
}
