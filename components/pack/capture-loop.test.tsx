// @vitest-environment jsdom
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureLoop } from "@/components/pack/capture-loop";
import type {
	CategoryDto,
	LocationRef,
	PackingSessionDto,
} from "@/lib/api/types";
import { UploadQueueContext } from "@/lib/client/upload";
import { fakeBackend, json, makeQueue } from "@/lib/client/upload/test-helpers";

const location: LocationRef = {
	id: "loc-1",
	kind: "bag",
	code: "B-07",
	name: "Bag B-07",
};
const session: PackingSessionDto = {
	id: "sess-1",
	ownerId: "owner-1",
	access: "owner",
	mode: "pack",
	locationId: "loc-1",
	startedAt: "2026-11-03T10:00:00.000Z",
	endedAt: null,
};
const categories: CategoryDto[] = [
	{ id: "tops", name: "Tops", slug: "tops", parentId: null, sortOrder: 0 },
	{
		id: "knit",
		name: "Knitwear",
		slug: "knitwear",
		parentId: "tops",
		sortOrder: 0,
	},
	{
		id: "trousers",
		name: "Trousers",
		slug: "trousers",
		parentId: null,
		sortOrder: 1,
	},
];

let backend: ReturnType<typeof fakeBackend>;

beforeEach(() => {
	backend = fakeBackend();
	vi.stubGlobal("fetch", backend.fetch);
	// jsdom has no object URLs.
	let n = 0;
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: vi.fn(() => `blob:preview-${++n}`),
			revokeObjectURL: vi.fn(),
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function setup() {
	// One upload at a time, so the fake backend hands out item-1, item-2 in
	// capture order; concurrency itself is covered by the queue tests.
	const { queue } = makeQueue({ concurrency: 1 });
	const onEnd = vi.fn();
	const user = userEvent.setup();
	render(
		<UploadQueueContext.Provider value={queue}>
			<CaptureLoop
				session={session}
				location={location}
				onEnd={onEnd}
				categories={categories}
			/>
		</UploadQueueContext.Provider>,
	);
	return { queue, onEnd, user };
}

const shot = (name = "IMG_0001.jpg") =>
	new File(["jpeg-bytes"], name, { type: "image/jpeg" });

describe("CaptureLoop", () => {
	it("turns each shutter press into an item in the location", async () => {
		const { queue, user } = setup();
		expect(screen.getByText(/press the shutter/i)).toBeInTheDocument();

		await user.upload(screen.getByTestId("shutter"), shot());
		await user.upload(screen.getByTestId("shutter"), shot("IMG_0002.jpg"));
		await queue.whenIdle();

		const strip = screen.getByRole("list", { name: "Captured items" });
		await waitFor(() =>
			expect(within(strip).getAllByRole("button")).toHaveLength(2),
		);
		expect(
			within(strip).getByRole("button", { name: "Item 2: processing" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByText(/2 items/)).toBeInTheDocument();
		expect(backend.find("POST", "/api/items").map((c) => c.body)).toEqual([
			{ locationId: "loc-1", sessionId: "sess-1" },
			{ locationId: "loc-1", sessionId: "sess-1" },
		]);
		expect(backend.find("POST", "/api/photos/photo-2/complete")).toHaveLength(
			1,
		);
	});

	it("edits the latest capture's name and category without leaving the loop", async () => {
		const { queue, user } = setup();
		await user.upload(screen.getByTestId("shutter"), shot());
		await queue.whenIdle();

		await user.type(
			await screen.findByRole("textbox", { name: "Name" }),
			"Grey cardigan{Enter}",
		);
		await user.click(screen.getByRole("button", { name: "Tops" }));
		// Drilled into Tops: its children are offered.
		await user.click(await screen.findByRole("button", { name: "Knitwear" }));
		await queue.whenIdle();

		await waitFor(() =>
			expect(backend.find("PATCH", "/api/items/item-1").at(-1)?.body).toEqual({
				name: "Grey cardigan",
				categoryId: "knit",
			}),
		);
		expect(screen.getByRole("button", { name: "Knitwear" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("adds a label photo to the selected item", async () => {
		const { queue, user } = setup();
		await user.upload(screen.getByTestId("shutter"), shot());
		await user.upload(screen.getByTestId("shutter"), shot("IMG_0002.jpg"));
		await queue.whenIdle();
		// Select the first item, then photograph its label.
		await user.click(screen.getByRole("button", { name: /^Item 1:/ }));
		await user.upload(screen.getByTestId("label-input"), shot("label.jpg"));
		await queue.whenIdle();

		const label = backend
			.find("POST", "/api/photos")
			.find((c) => (c.body as { kind: string }).kind === "label");
		expect(label?.body).toMatchObject({ itemId: "item-1", kind: "label" });
		expect(screen.getByText("Add another label photo")).toBeInTheDocument();
		expect(screen.getAllByLabelText("Has label photo")).toHaveLength(1);
	});

	it("shows a failed upload and retries it", async () => {
		let reject = true;
		backend.use((c) =>
			c.url === "/api/items" && reject
				? json({ error: "unprocessable", message: "Location is archived" }, 422)
				: undefined,
		);
		const { queue, user } = setup();
		await user.upload(screen.getByTestId("shutter"), shot());
		await queue.whenIdle();

		expect(
			await screen.findByRole("button", { name: "Item 1: failed" }),
		).toBeInTheDocument();
		expect(screen.getByText("Location is archived")).toBeInTheDocument();

		reject = false;
		await user.click(screen.getByRole("button", { name: "Retry" }));
		await queue.whenIdle();
		expect(
			await screen.findByRole("button", { name: "Item 1: processing" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument();
	});

	it("tells the user to sign in again when the session expired", async () => {
		backend.use((c) =>
			c.url.startsWith("/api/")
				? json({ error: "unauthorized", message: "Not signed in" }, 401)
				: undefined,
		);
		const { queue, user } = setup();
		await user.upload(screen.getByTestId("shutter"), shot());
		await queue.whenIdle();
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/sign-in expired/i,
		);
	});

	it("ends the session from Done", async () => {
		const { user, onEnd } = setup();
		await user.click(screen.getByRole("button", { name: "Done" }));
		expect(onEnd).toHaveBeenCalledOnce();
	});
});
