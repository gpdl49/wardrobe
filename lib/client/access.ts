import type { Access, SharedWithMeDto } from "@/lib/api/types";

/**
 * May the caller delete or re-parent this location? Mirrors lib/access: the
 * owner and whole-wardrobe editors may, a location editor only for what is
 * nested in their share, not for the location that was shared with them.
 */
export function canRestructure(
	location: { id: string; ownerId: string; access: Access },
	shared: readonly SharedWithMeDto[],
): boolean {
	if (location.access === "owner") {
		return true;
	}
	if (location.access !== "edit") {
		return false;
	}
	const ofOwner = shared.filter((s) => s.owner.id === location.ownerId);
	return (
		ofOwner.some((s) => !s.location && s.access === "edit") ||
		!ofOwner.some((s) => s.location?.id === location.id)
	);
}

/** A person's name in the UI. */
export const userLabel = (user: {
	email: string | null;
	username: string | null;
}) => user.username ?? user.email ?? "Someone";
