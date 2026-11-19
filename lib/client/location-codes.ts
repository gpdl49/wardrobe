import type { LocationKind } from "@/lib/api/types";

export const PACK_LOCATION_KINDS = ["bag", "vacuum_bag", "suitcase"] as const;
type PackLocationKind = (typeof PACK_LOCATION_KINDS)[number];

const CODE_PREFIX: Record<PackLocationKind, string> = {
	bag: "B",
	vacuum_bag: "V",
	suitcase: "S",
};

const KIND_BY_PREFIX: Record<string, LocationKind> = {
	B: "bag",
	V: "vacuum_bag",
	S: "suitcase",
	CL: "closet",
	D: "drawer",
	DR: "drawer",
};

/**
 * The next free numbered code for a kind: one past the highest number in use
 * with that prefix, zero-padded to two digits (`B-08` after `B-07`). Gaps are
 * not reused, so a retired bag's printed label never points at a new one.
 * Pass every location, archived ones included.
 */
export function nextFreeCode(
	codes: Iterable<string>,
	kind: PackLocationKind,
): string {
	const prefix = CODE_PREFIX[kind];
	const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
	const taken = new Set<string>();
	let max = 0;
	for (const code of codes) {
		taken.add(code.toUpperCase());
		const n = Number(pattern.exec(code)?.[1] ?? Number.NaN);
		if (Number.isSafeInteger(n) && n > max) {
			max = n;
		}
	}
	let next = max + 1;
	let candidate = format(prefix, next);
	// Defensive: `B-8` and `B-08` are different strings but look alike.
	while (taken.has(candidate)) {
		next += 1;
		candidate = format(prefix, next);
	}
	return candidate;
}

function format(prefix: string, n: number): string {
	return `${prefix}-${String(n).padStart(2, "0")}`;
}

/** Best guess of the kind from a code's prefix (`B-12` is a bag). */
export function kindForCode(code: string): LocationKind {
	const prefix = /^([A-Z]+)-/i.exec(code)?.[1]?.toUpperCase();
	return (prefix && KIND_BY_PREFIX[prefix]) || "other";
}

const KIND_LABEL: Record<LocationKind, string> = {
	bag: "Bag",
	vacuum_bag: "Vacuum bag",
	suitcase: "Suitcase",
	closet: "Closet",
	drawer: "Drawer",
	other: "Location",
};

export function kindLabel(kind: LocationKind): string {
	return KIND_LABEL[kind];
}

/** Default display name for a new numbered container: "Bag B-08". */
export function defaultName(kind: LocationKind, code: string): string {
	return `${KIND_LABEL[kind]} ${code}`;
}
