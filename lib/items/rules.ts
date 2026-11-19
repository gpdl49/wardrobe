import type { ItemStatus, LocationKind } from "@/lib/api/types";
import { badRequest } from "@/lib/http/errors";

/**
 * Status follows the kind of place an item is moved into:
 *
 * - into a bag, vacuum bag or suitcase -> `stored` (packed away);
 * - into a closet or drawer -> `active` (back in use, also for an item that
 *   was lent, donated or discarded and has come back);
 * - into an `other` location or out of any location -> unchanged.
 *
 * Applied by POST /api/items/move and whenever POST/PATCH /api/items changes
 * `locationId` without an explicit `status` in the same request.
 */
export function statusForLocationKind(
	kind: LocationKind | null | undefined,
): ItemStatus | null {
	switch (kind) {
		case "bag":
		case "vacuum_bag":
		case "suitcase":
			return "stored";
		case "closet":
		case "drawer":
			return "active";
		default:
			return null;
	}
}

/**
 * Opaque keyset cursor for GET /api/items, ordered by (createdAt desc, id
 * desc). createdAt is set by Prisma at millisecond precision, so the ISO
 * string round-trips exactly.
 */
export type ItemCursor = { createdAt: Date; id: string };

export function encodeCursor(cursor: ItemCursor): string {
	return Buffer.from(
		`${cursor.createdAt.toISOString()}|${cursor.id}`,
		"utf8",
	).toString("base64url");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 400 on anything encodeCursor could not have produced. */
export function decodeCursor(raw: string): ItemCursor {
	const [iso, id, ...rest] = Buffer.from(raw, "base64url")
		.toString("utf8")
		.split("|");
	const createdAt = new Date(iso ?? "");
	if (
		rest.length > 0 ||
		!id ||
		!UUID.test(id) ||
		Number.isNaN(createdAt.getTime()) ||
		createdAt.toISOString() !== iso
	) {
		throw badRequest("Invalid cursor");
	}
	return { createdAt, id };
}
