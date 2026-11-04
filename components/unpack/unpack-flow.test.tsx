// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UnpackApi, UnpackFlow } from "@/components/unpack/unpack-flow";
import type { LocationDetailDto, LocationDto } from "@/lib/api/types";
import { ApiError } from "@/lib/client/api";
import { itemDto, json } from "@/lib/client/upload/test-helpers";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const stamp = "2026-11-03T00:00:00.000Z";
const loc = (
	id: string,
	kind: LocationDto["kind"],
	code: string,
	name: string,
): LocationDto => ({
	id,
	ownerId: "user-a",
	access: "owner",
	kind,
	code,
	name,
	notes: null,
	parentId: null,
	archivedAt: null,
	createdAt: stamp,
	updatedAt: stamp,
	itemCount: 0,
});

const bag = loc("bag-7", "bag", "B-07", "Bag B-07");
const closet = loc("closet-1", "closet", "CL-BEDROOM", "Bedroom closet");
const drawer = loc("drawer-1", "drawer", "D-01", "Sock drawer");
const detail: LocationDetailDto = {
	...bag,
	itemCount: 3,
	children: [],
	items: [
		itemDto("i-1", { name: "Navy jumper" }),
		itemDto("i-2", { name: "Linen shirt" }),
		itemDto("i-3", { name: "Wool scarf" }),
	],
};

let api: { [K in keyof UnpackApi]: ReturnType<typeof vi.fn> };

beforeEach(() => {
	api = {
		getLocation: vi.fn(async () => structuredClone(detail)),
		moveItems: vi.fn(async ({ itemIds }: { itemIds: string[] }) => ({
			moved: itemIds.length,
		})),
		startSession: vi.fn(async () => ({
			id: "sess-9",
			mode: "unpack",
			locationId: bag.id,
			startedAt: stamp,
			endedAt: null,
		})),
		endSession: vi.fn(async () => ({})),
	};
	// The destination picker lists locations through fetch.
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) =>
			url.startsWith("/api/locations")
				? json([bag, drawer, closet])
				: json({ error: "not_found", message: url }, 404),
		),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function setup() {
	const user = userEvent.setup();
	render(
		<UnpackFlow initialLocationId={bag.id} api={api as unknown as UnpackApi} />,
	);
	return user;
}

const itemButton = (name: string) =>
	screen.getByRole("button", { name: new RegExp(name) });

describe("UnpackFlow", () => {
	it("selects items by tapping, and all/none", async () => {
		const user = setup();
		await screen.findByText("Navy jumper");
		const move = screen.getByRole("button", { name: "Select items to move" });
		expect(move).toBeDisabled();

		await user.click(itemButton("Navy jumper"));
		await user.click(itemButton("Wool scarf"));
		expect(itemButton("Navy jumper")).toHaveAttribute("aria-pressed", "true");
		expect(itemButton("Linen shirt")).toHaveAttribute("aria-pressed", "false");
		expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Move 2 items…" })).toBeEnabled();

		await user.click(itemButton("Navy jumper"));
		expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Select all" }));
		expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Select none" }));
		expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
	});

	it("moves the selection to a closet in a session, and undoes it", async () => {
		const user = setup();
		await screen.findByText("Navy jumper");
		await user.click(itemButton("Navy jumper"));
		await user.click(itemButton("Linen shirt"));
		await user.click(screen.getByRole("button", { name: "Move 2 items…" }));

		// Closets and drawers come first; the source bag is not offered.
		const list = await screen.findByRole("list");
		const options = within(list).getAllByRole("button");
		expect(options.map((o) => o.textContent)).toEqual([
			expect.stringContaining("CL-BEDROOM"),
			expect.stringContaining("D-01"),
		]);
		await user.click(options[0] as HTMLElement);

		expect(api.startSession).toHaveBeenCalledWith(
			{ mode: "unpack", locationId: bag.id },
			{ idempotencyKey: expect.any(String) },
		);
		expect(api.moveItems).toHaveBeenCalledWith({
			itemIds: ["i-1", "i-2"],
			toLocationId: closet.id,
			sessionId: "sess-9",
		});
		expect(await screen.findByRole("status")).toHaveTextContent(
			"Moved 2 to CL-BEDROOM",
		);
		expect(screen.queryByText("Navy jumper")).not.toBeInTheDocument();
		expect(screen.getByText("0 of 1 selected")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Undo" }));
		expect(api.moveItems).toHaveBeenLastCalledWith({
			itemIds: ["i-1", "i-2"],
			toLocationId: bag.id,
			sessionId: "sess-9",
		});
		expect(await screen.findByText("Navy jumper")).toBeInTheDocument();
		expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();

		// A second move reuses the session; Done ends it.
		await user.click(itemButton("Wool scarf"));
		await user.click(screen.getByRole("button", { name: "Move 1 item…" }));
		await user.click(await screen.findByRole("button", { name: /D-01/ }));
		expect(api.startSession).toHaveBeenCalledOnce();
		await user.click(screen.getByRole("button", { name: "Done" }));
		expect(api.endSession).toHaveBeenCalledWith("sess-9");
	});

	it("keeps the selection when a move fails", async () => {
		api.moveItems.mockRejectedValueOnce(new Error("Session has ended"));
		const user = setup();
		await screen.findByText("Navy jumper");
		await user.click(itemButton("Navy jumper"));
		await user.click(screen.getByRole("button", { name: "Move 1 item…" }));
		await user.click(await screen.findByRole("button", { name: /CL-BEDROOM/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Session has ended",
		);
		expect(itemButton("Navy jumper")).toHaveAttribute("aria-pressed", "true");
	});

	it("retries a failed session start with the same Idempotency-Key", async () => {
		api.startSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		const user = setup();
		await screen.findByText("Navy jumper");
		await user.click(itemButton("Navy jumper"));
		await user.click(screen.getByRole("button", { name: "Move 1 item…" }));
		await user.click(await screen.findByRole("button", { name: /CL-BEDROOM/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Failed to fetch",
		);
		expect(api.moveItems).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Move 1 item…" }));
		await user.click(await screen.findByRole("button", { name: /CL-BEDROOM/ }));
		expect(await screen.findByRole("status")).toHaveTextContent(
			"Moved 1 to CL-BEDROOM",
		);
		const keys = api.startSession.mock.calls.map((c) => c[1]?.idempotencyKey);
		expect(keys).toHaveLength(2);
		expect(keys[0]).toEqual(expect.any(String));
		expect(keys[1]).toBe(keys[0]);
	});

	it("starts a new session with a new key after the session ended elsewhere", async () => {
		api.moveItems.mockRejectedValueOnce(
			new ApiError(409, "conflict", "Session has ended"),
		);
		const user = setup();
		await screen.findByText("Navy jumper");
		await user.click(itemButton("Navy jumper"));
		await user.click(screen.getByRole("button", { name: "Move 1 item…" }));
		await user.click(await screen.findByRole("button", { name: /CL-BEDROOM/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Session has ended",
		);

		await user.click(screen.getByRole("button", { name: "Move 1 item…" }));
		await user.click(await screen.findByRole("button", { name: /CL-BEDROOM/ }));
		expect(await screen.findByRole("status")).toBeInTheDocument();
		const keys = api.startSession.mock.calls.map((c) => c[1]?.idempotencyKey);
		expect(keys).toHaveLength(2);
		expect(keys[1]).not.toBe(keys[0]);
	});
});
