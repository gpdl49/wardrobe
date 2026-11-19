import type { ItemStatus, LocationKind, Season } from "@/lib/api/types";

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
export const ITEM_STATUSES: ItemStatus[] = [
	"active",
	"stored",
	"lent",
	"donated",
	"discarded",
];
export const LOCATION_KINDS: LocationKind[] = [
	"bag",
	"vacuum_bag",
	"suitcase",
	"closet",
	"drawer",
	"other",
];

export const SEASON_LABELS: Record<Season, string> = {
	spring: "Spring",
	summer: "Summer",
	autumn: "Autumn",
	winter: "Winter",
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
	active: "In use",
	stored: "Stored",
	lent: "Lent",
	donated: "Donated",
	discarded: "Discarded",
};

export const KIND_LABELS: Record<LocationKind, { one: string; many: string }> =
	{
		bag: { one: "Bag", many: "Bags" },
		vacuum_bag: { one: "Vacuum bag", many: "Vacuum bags" },
		suitcase: { one: "Suitcase", many: "Suitcases" },
		closet: { one: "Closet", many: "Closets" },
		drawer: { one: "Drawer", many: "Drawers" },
		other: { one: "Other", many: "Other" },
	};

export function itemTitle(item: {
	name: string | null;
	category: { name: string } | null;
	brand?: string | null;
}): string {
	return item.name || item.category?.name || item.brand || "Untitled item";
}

export function locationLabel(location: { code: string; name: string }) {
	return location.name && location.name !== location.code
		? `${location.code} · ${location.name}`
		: location.code;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) =>
	dateTimeFormat.format(new Date(iso));
