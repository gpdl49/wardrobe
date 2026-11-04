import type {
	LocationRef,
	PackingSessionDto,
	SessionMode,
} from "@/lib/api/types";

/**
 * The session in progress on this device, so a reload (or iOS discarding
 * the tab) returns to the capture loop instead of the location chooser. Kept
 * per user: someone else signing in on this device gets their own.
 */
export type ActiveSession = {
	session: PackingSessionDto;
	location: LocationRef;
};

const key = (userId: string, mode: SessionMode) =>
	`wardrobe.session.${userId}.${mode}`;

export function loadActiveSession(
	userId: string,
	mode: SessionMode,
): ActiveSession | null {
	try {
		const raw = localStorage.getItem(key(userId, mode));
		return raw ? (JSON.parse(raw) as ActiveSession) : null;
	} catch {
		return null;
	}
}

export function saveActiveSession(
	userId: string,
	mode: SessionMode,
	active: ActiveSession,
) {
	try {
		localStorage.setItem(key(userId, mode), JSON.stringify(active));
	} catch {
		// Private mode or full storage: the session just won't survive a reload.
	}
}

export function clearActiveSession(userId: string, mode: SessionMode) {
	try {
		localStorage.removeItem(key(userId, mode));
	} catch {
		// Ignore.
	}
}
