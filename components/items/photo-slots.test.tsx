// @vitest-environment jsdom
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoSlots } from "@/components/items/photo-slots";
import type { ItemDetailDto } from "@/lib/api/types";
import { queryKeys } from "@/lib/client/queries";
import { UploadQueueContext } from "@/lib/client/upload";
import {
	fakeBackend,
	makeQueue,
	photoDto,
} from "@/lib/client/upload/test-helpers";
import { itemDetail } from "@/test/helpers/factories";

let backend: ReturnType<typeof fakeBackend>;

beforeEach(() => {
	backend = fakeBackend();
	vi.stubGlobal("fetch", backend.fetch);
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: vi.fn(() => "blob:preview"),
			revokeObjectURL: vi.fn(),
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function setup(item: ItemDetailDto) {
	const { queue } = makeQueue();
	// The app starts the queue on sign-in (lib/client/upload/lifecycle).
	await queue.start();
	const client = new QueryClient();
	const invalidate = vi.spyOn(client, "invalidateQueries");
	const onShow = vi.fn();
	render(
		<QueryClientProvider client={client}>
			<UploadQueueContext.Provider value={queue}>
				<PhotoSlots item={item} onShow={onShow} />
			</UploadQueueContext.Provider>
		</QueryClientProvider>,
	);
	return { queue, invalidate, onShow, user: userEvent.setup() };
}

const shot = (name: string) =>
	new File(["jpeg-bytes"], name, { type: "image/jpeg" });

describe("PhotoSlots", () => {
	it("shows filled slots and offers the empty ones", async () => {
		const front = photoDto("front-1", { itemId: "item-1", status: "ready" });
		const { onShow, user } = await setup(itemDetail({ photos: [front] }));

		await user.click(screen.getByRole("button", { name: "Show front photo" }));
		expect(onShow).toHaveBeenCalledWith("front-1");
		expect(screen.getByLabelText("Add back photo")).toBeInTheDocument();
		expect(screen.getByLabelText("Add label photo")).toBeInTheDocument();
		expect(screen.getByLabelText("Add detail photo")).toBeInTheDocument();
		expect(screen.queryByLabelText("Add front photo")).not.toBeInTheDocument();
	});

	it("uploads a back photo to the item and refreshes it", async () => {
		const { queue, invalidate, user } = await setup(itemDetail());

		await user.upload(screen.getByTestId("slot-back"), shot("back.jpg"));

		await waitFor(() =>
			expect(backend.find("POST", "/api/photos")[0]?.body).toMatchObject({
				itemId: "item-1",
				kind: "back",
			}),
		);
		await waitFor(() =>
			expect(invalidate).toHaveBeenCalledWith({
				queryKey: queryKeys.item("item-1"),
			}),
		);
		// Finished jobs leave the local queue once the item shows them.
		await waitFor(() => expect(queue.getSnapshot().jobs).toHaveLength(0));
	});

	it("takes several detail photos at once", async () => {
		const { user } = await setup(itemDetail());

		await user.upload(screen.getByTestId("slot-detail"), [
			shot("a.jpg"),
			shot("b.jpg"),
		]);

		await waitFor(() =>
			expect(
				backend.find("POST", "/api/photos").map((c) => c.body),
			).toMatchObject([{ kind: "detail" }, { kind: "detail" }]),
		);
	});

	it("is hidden from viewers", async () => {
		await setup(itemDetail({ access: "view" }));
		expect(screen.queryByLabelText("Add back photo")).not.toBeInTheDocument();
	});
});
