// @vitest-environment jsdom
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackFlow } from "@/components/pack/pack-flow";
import type {
	LocationDetailDto,
	MeDto,
	PackingSessionDto,
} from "@/lib/api/types";
import { CurrentUserContext } from "@/lib/client/current-user";
import { UploadQueueContext } from "@/lib/client/upload";
import { fakeBackend, json, makeQueue } from "@/lib/client/upload/test-helpers";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const stamp = "2026-11-03T00:00:00.000Z";
const bag: LocationDetailDto = {
	id: "bag-7",
	ownerId: "user-a",
	access: "owner",
	kind: "bag",
	code: "B-07",
	name: "Bag B-07",
	notes: null,
	parentId: null,
	archivedAt: null,
	createdAt: stamp,
	updatedAt: stamp,
	itemCount: 0,
	children: [],
	items: [],
};
const session: PackingSessionDto = {
	id: "sess-1",
	ownerId: "user-a",
	access: "owner",
	mode: "pack",
	locationId: bag.id,
	startedAt: stamp,
	endedAt: null,
};

const ME: MeDto = {
	id: "user-a",
	sub: "sub-a",
	email: null,
	username: "a",
	groups: ["wardrobe"],
	isAdmin: false,
};

let backend: ReturnType<typeof fakeBackend>;

beforeEach(() => {
	localStorage.clear();
	backend = fakeBackend();
	backend.use((c) => {
		if (c.method === "GET" && c.url === `/api/locations/${bag.id}`) {
			return json(bag);
		}
		if (c.method === "GET" && c.url === "/api/categories") return json([]);
		return undefined;
	});
	vi.stubGlobal("fetch", backend.fetch);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function setup() {
	const { queue } = makeQueue();
	const user = userEvent.setup();
	render(
		<CurrentUserContext.Provider value={ME}>
			<UploadQueueContext.Provider value={queue}>
				<PackFlow initialLocationId={bag.id} />
			</UploadQueueContext.Provider>
		</CurrentUserContext.Provider>,
	);
	return user;
}

describe("PackFlow", () => {
	it("starts the session with an Idempotency-Key and reuses it on Try again", async () => {
		let down = true;
		backend.use((c) => {
			if (c.method !== "POST" || c.url !== "/api/sessions") return undefined;
			return down
				? json({ error: "internal", message: "Database unavailable" }, 503)
				: json(session, 201);
		});
		const user = setup();

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Database unavailable",
		);
		down = false;
		await user.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText(/press the shutter/i)).toBeInTheDocument();

		const starts = backend.find("POST", "/api/sessions");
		expect(starts.map((c) => c.body)).toEqual([
			{ mode: "pack", locationId: bag.id },
			{ mode: "pack", locationId: bag.id },
		]);
		const keys = starts.map((c) => c.headers.get("idempotency-key"));
		expect(keys[0]).toEqual(expect.any(String));
		expect(keys[1]).toBe(keys[0]);
	});

	it("uses a new key when another location is picked", async () => {
		backend.use((c) =>
			c.method === "POST" && c.url === "/api/sessions"
				? json({ error: "internal", message: "Database unavailable" }, 503)
				: undefined,
		);
		backend.use((c) =>
			c.method === "GET" && c.url.startsWith("/api/locations?")
				? json([bag])
				: undefined,
		);
		const user = setup();
		await screen.findByRole("alert");
		await user.click(screen.getByRole("button", { name: "Pick another" }));
		await user.click(await screen.findByRole("button", { name: /B-07/ }));
		await screen.findByRole("alert");

		const keys = backend
			.find("POST", "/api/sessions")
			.map((c) => c.headers.get("idempotency-key"));
		expect(keys).toHaveLength(2);
		expect(keys[1]).not.toBe(keys[0]);
	});
});
