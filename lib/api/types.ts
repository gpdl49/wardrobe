/**
 * JSON shapes of the HTTP API (docs/wardrobe.md "HTTP API"). The contract
 * between route handlers and the UI: services serialise to these, client code
 * consumes them. Dates are ISO 8601 strings on the wire. Change here first.
 */

export type LocationKind = "bag" | "suitcase" | "closet" | "drawer" | "other";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type ItemStatus = "active" | "stored" | "lent" | "donated" | "discarded";
/** `outfit`: a photo of an outfit (PhotoDto.outfitId), not of one item. */
export type PhotoKind = "main" | "label" | "detail" | "outfit";
export type PhotoStatus = "pending" | "processing" | "ready" | "failed";
export type PhotoVariant = "original" | "display" | "thumb";
export type SessionMode = "pack" | "unpack";
export type AnalysisKind = "colors" | "vision";
export type AnalysisStatus = "queued" | "running" | "done" | "failed";
export type SuggestionStatus = "queued" | "running" | "done" | "failed";
export type SuggestionFeedback = "saved" | "dismissed";
export type OutfitPhotoSource = "upload" | "immich";
/** What a share grants. */
export type ShareAccess = "view" | "edit";
/** What the caller may do with a row. */
export type Access = "owner" | ShareAccess;

export interface ApiError {
	error: string;
	message: string;
}

export interface LocationDto {
	id: string;
	ownerId: string;
	access: Access;
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
	ownerId: string;
	access: Access;
	itemId: string | null;
	/** Set for an outfit photo (kind `outfit`); then itemId is null. */
	outfitId: string | null;
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
	ownerId: string;
	access: Access;
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
	ownerId: string;
	access: Access;
	mode: SessionMode;
	locationId: string;
	startedAt: string;
	endedAt: string | null;
}

export interface MeDto {
	id: string;
	sub: string;
	email: string | null;
	username: string | null;
	groups: string[];
	isAdmin: boolean;
	/** Optional server features that are switched on (lib/env). */
	features: FeaturesDto;
}

export interface FeaturesDto {
	/** Vision analysis of item photos (OPENROUTER_API_KEY). */
	vision: boolean;
	/** Outfit suggestions (OPENROUTER_API_KEY). */
	suggestions: boolean;
	/** Linking Immich photos (IMMICH_URL and SECRETS_KEY). */
	immich: boolean;
}

/** Another user, as shown on a share. */
export interface UserRef {
	id: string;
	email: string | null;
	username: string | null;
}

/** GET /api/shares: a share the caller owns. */
export interface ShareDto {
	id: string;
	ownerId: string;
	grantee: UserRef;
	access: ShareAccess;
	/** Null: the whole wardrobe. */
	location: LocationRef | null;
	createdAt: string;
	updatedAt: string;
}

/** GET /api/shared-with-me */
export interface SharedWithMeDto {
	id: string;
	owner: UserRef;
	access: ShareAccess;
	/** Null: the whole wardrobe. */
	location: Pick<LocationRef, "id" | "code" | "name"> | null;
}

/** GET /api/sessions/{id}: the session and the items moved in it. */
export interface PackingSessionDetailDto extends PackingSessionDto {
	location: LocationRef;
	items: ItemSummaryDto[];
}

// ---------------------------------------------------------------------------
// Outfits, Immich and suggestions (docs/outfits/contract.md)
// ---------------------------------------------------------------------------

/**
 * A photo of an outfit: an upload (a Photo row of kind `outfit`) or a linked
 * Immich asset. `urls` are same-origin API paths in both cases.
 */
export interface OutfitPhotoDto {
	/** Photo id (upload) or link id (immich). */
	id: string;
	source: OutfitPhotoSource;
	/** Uploads go pending -> processing -> ready; Immich links are always ready. */
	status: PhotoStatus;
	width: number | null;
	height: number | null;
	/** Uploads only. */
	blurhash: string | null;
	/** Immich only: base64 thumbhash. */
	thumbhash: string | null;
	/** Immich only: the asset id in Immich. */
	assetId: string | null;
	/** Immich only: when the photo was taken. */
	takenAt: string | null;
	createdAt: string;
	urls: Record<"display" | "thumb", string>;
}

/** An item as drawn in an outfit tile's collage. */
export interface OutfitItemRef {
	id: string;
	name: string | null;
	coverPhoto: PhotoDto | null;
}

/** Outfit in lists (GET /api/outfits, /api/outfits/shared-with-me). */
export interface OutfitSummaryDto {
	id: string;
	ownerId: string;
	access: Access;
	name: string;
	notes: string | null;
	seasons: Season[];
	tags: string[];
	itemCount: number;
	/** The first six items, in order. */
	previewItems: OutfitItemRef[];
	/** First ready upload, else first Immich asset, else null. */
	cover: OutfitPhotoDto | null;
	createdAt: string;
	updatedAt: string;
}

export interface OutfitShareDto {
	id: string;
	grantee: UserRef;
	createdAt: string;
}

/** GET /api/outfits/{id} */
export interface OutfitDetailDto extends OutfitSummaryDto {
	owner: UserRef;
	/**
	 * In order. An item the caller could not otherwise read has access `view`
	 * and a null location.
	 */
	items: ItemSummaryDto[];
	/**
	 * Ids of the items the caller can open with GET /api/items/{id}. The rest
	 * are visible only through this outfit.
	 */
	readableItemIds: string[];
	/** Uploads and Immich links together, oldest first. */
	photos: OutfitPhotoDto[];
	/** Empty unless the caller owns the outfit. */
	shares: OutfitShareDto[];
}

/** GET /api/outfits */
export interface OutfitListDto {
	outfits: OutfitSummaryDto[];
	nextCursor: string | null;
}

/** GET /api/immich */
export interface ImmichStatusDto {
	/** The server has IMMICH_URL and SECRETS_KEY. */
	enabled: boolean;
	/** The caller has stored a working API key. */
	connected: boolean;
	/** The Immich web URL, for "open in Immich" links. */
	url: string | null;
	user: { id: string; email: string | null; name: string | null } | null;
}

/** An asset in the caller's Immich library (the picker). */
export interface ImmichAssetDto {
	id: string;
	fileName: string | null;
	width: number | null;
	height: number | null;
	thumbhash: string | null;
	takenAt: string | null;
	/** `/api/immich/assets/{id}/thumb` */
	thumbUrl: string;
}

/** GET /api/immich/assets */
export interface ImmichAssetListDto {
	assets: ImmichAssetDto[];
	nextCursor: string | null;
}

/** Body of POST /api/suggestion-runs, minus ownerId; stored on the run. */
export interface SuggestionRequest {
	/** Free text: the occasion, the weather, a mood. */
	prompt?: string;
	season?: Season;
	/** Items every proposal must include. */
	itemIds?: string[];
	/** How many outfits to propose (1-6, default 3). */
	count?: number;
}

export interface OutfitSuggestionDto {
	id: string;
	runId: string;
	name: string;
	rationale: string | null;
	/** Items deleted since the run are left out. */
	items: ItemSummaryDto[];
	feedback: SuggestionFeedback | null;
	/** The outfit it was saved as. */
	outfitId: string | null;
	createdAt: string;
}

/** GET /api/suggestion-runs/{id} */
export interface SuggestionRunDto {
	id: string;
	ownerId: string;
	status: SuggestionStatus;
	request: SuggestionRequest;
	model: string | null;
	error: string | null;
	createdAt: string;
	updatedAt: string;
	/** Empty until status is done. */
	suggestions: OutfitSuggestionDto[];
}

/** POST /api/items/analyses */
export interface BulkAnalysesDto {
	queued: number;
}

/** POST /api/items/analyses/apply-tags */
export interface BulkApplyTagsDto {
	updated: number;
}
