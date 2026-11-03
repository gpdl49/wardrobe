import type {
	LocationRef,
	PackingSessionDto,
	SessionMode,
} from "@/lib/api/types";

/**
 * The session in progress on this device, so a reload (or iOS discarding
 * the tab) returns to the capture loop instead of the location chooser.
 */
export type ActiveSession = {
	session: PackingSessionDto;
	location: LocationRef;
};

const key = (mode: SessionMode) => `wardrobe.session.${mode}`;

export function loadActiveSession(mode: SessionMode): ActiveSession | null {
	try {
		const raw = localStorage.getItem(key(mode));
		return raw ? (JSON.parse(raw) as ActiveSession) : null;
	} catch {
		return null;
	}
}

export function saveActiveSession(mode: SessionMode, active: ActiveSession) {
	try {
		localStorage.setItem(key(mode), JSON.stringify(active));
	} catch {
		// Private mode or full storage: the session just won't survive a reload.
	}
}

export function clearActiveSession(mode: SessionMode) {
	try {
		localStorage.removeItem(key(mode));
	} catch {
		// Ignore.
	}
}
