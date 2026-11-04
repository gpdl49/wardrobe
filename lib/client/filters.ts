import type { ItemStatus, Season } from "@/lib/api/types";
import type { ItemsQuery } from "./api";
import { ITEM_STATUSES, SEASONS } from "./labels";

/**
 * Catalogue state in the URL query string, so a filtered view can be
 * bookmarked, shared and survives back/forward:
 * `/?owner=…&location=…&category=…&tag=…&season=…&status=…&color=…&q=…&view=list&group=location`.
 * The item filters use the same names as GET /api/items.
 */
export interface CatalogueFilters {
	/** Whose wardrobe (a user id); empty is the caller's own. */
	owner: string;
	q: string;
	location: string;
	category: string;
	tag: string;
	season: Season | "";
	status: ItemStatus | "";
	color: string;
	view: "grid" | "list";
	group: "none" | "location" | "category";
}

export const DEFAULT_FILTERS: CatalogueFilters = {
	owner: "",
	q: "",
	location: "",
	category: "",
	tag: "",
	season: "",
	status: "",
	color: "",
	view: "grid",
	group: "none",
};

/** The keys that narrow the item list (not presentation, or whose wardrobe). */
export const ITEM_FILTER_KEYS = [
	"location",
	"category",
	"tag",
	"season",
	"status",
	"color",
	"q",
] as const satisfies ReadonlyArray<keyof CatalogueFilters>;

const oneOf = <T extends string>(
	values: readonly T[],
	value: string | null,
): T | "" =>
	value && (values as readonly string[]).includes(value) ? (value as T) : "";

type ParamsLike = Pick<URLSearchParams, "get">;

export function parseFilters(params: ParamsLike): CatalogueFilters {
	const text = (key: string) => (params.get(key) ?? "").trim();
	const view = params.get("view");
	const group = params.get("group");
	return {
		owner: text("owner"),
		q: text("q"),
		location: text("location"),
		category: text("category"),
		tag: text("tag").toLowerCase(),
		season: oneOf(SEASONS, params.get("season")),
		status: oneOf(ITEM_STATUSES, params.get("status")),
		color: text("color").toLowerCase(),
		view: view === "list" ? "list" : "grid",
		group: group === "location" || group === "category" ? group : "none",
	};
}

/** Query string for the page URL; defaults are left out. No leading "?". */
export function serializeFilters(filters: CatalogueFilters): string {
	const params = new URLSearchParams();
	for (const key of Object.keys(DEFAULT_FILTERS) as Array<
		keyof CatalogueFilters
	>) {
		const value = filters[key].trim();
		if (value && value !== DEFAULT_FILTERS[key]) {
			params.set(key, value);
		}
	}
	return params.toString();
}

/** GET /api/items query for the current filters. */
export function toItemsQuery(filters: CatalogueFilters): ItemsQuery {
	const query: ItemsQuery = {};
	if (filters.owner) query.owner = filters.owner;
	if (filters.q) query.q = filters.q;
	if (filters.location) query.location = filters.location;
	if (filters.category) query.category = filters.category;
	if (filters.tag) query.tag = filters.tag;
	if (filters.season) query.season = filters.season;
	if (filters.status) query.status = filters.status;
	if (filters.color) query.color = filters.color;
	return query;
}

export function activeFilterCount(filters: CatalogueFilters): number {
	return ITEM_FILTER_KEYS.filter((key) => key !== "q" && filters[key]).length;
}
