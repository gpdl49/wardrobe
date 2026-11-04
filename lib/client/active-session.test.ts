// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ActiveSession } from "@/lib/client/active-session";
import {
	clearActiveSession,
	loadActiveSession,
	saveActiveSession,
} from "@/lib/client/active-session";

const active: ActiveSession = {
	session: {
		id: "s-1",
		ownerId: "a",
		access: "owner",
		mode: "pack",
		locationId: "l-1",
		startedAt: "2026-11-03T00:00:00.000Z",
		endedAt: null,
	},
	location: { id: "l-1", kind: "bag", code: "B-01", name: "Bag" },
};

describe("active session", () => {
	beforeEach(() => localStorage.clear());

	it("is kept per user", () => {
		saveActiveSession("a", "pack", active);
		expect(loadActiveSession("a", "pack")).toEqual(active);
		expect(loadActiveSession("b", "pack")).toBeNull();
	});

	it("is kept per mode", () => {
		saveActiveSession("a", "pack", active);
		expect(loadActiveSession("a", "unpack")).toBeNull();
	});

	it("clearing one user's leaves the other's", () => {
		saveActiveSession("a", "pack", active);
		saveActiveSession("b", "pack", active);
		clearActiveSession("b", "pack");
		expect(loadActiveSession("a", "pack")).toEqual(active);
		expect(loadActiveSession("b", "pack")).toBeNull();
	});
});
