// @vitest-environment jsdom
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeDto } from "@/lib/api/types";
import { CurrentUserProvider, useCurrentUser } from "@/lib/client/current-user";
import { getUploadQueue, UploadQueueContext } from "@/lib/client/upload";
import { mockApi } from "@/test/helpers/dom";

const user = (id: string): MeDto => ({
	id,
	sub: `sub-${id}`,
	email: null,
	username: id,
	groups: ["wardrobe"],
	isAdmin: false,
	features: { vision: false, suggestions: false, immich: false },
});

function Probe() {
	const me = useCurrentUser();
	const queue = useContext(UploadQueueContext);
	return (
		<p>
			{me ? me.id : "nobody"}/{queue ? "queue" : "no queue"}
		</p>
	);
}

function setup() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<CurrentUserProvider>
				<Probe />
			</CurrentUserProvider>
		</QueryClientProvider>,
	);
	return client;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("CurrentUserProvider", () => {
	it("has no queue until the user is known", async () => {
		let answer: (value: Response) => void = () => {};
		mockApi({
			"GET /api/me": () =>
				new Promise<Response>((resolve) => {
					answer = resolve;
				}),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						answer = resolve;
					}),
			),
		);
		setup();
		expect(screen.getByText("nobody/no queue")).toBeInTheDocument();
		await waitFor(() => expect(fetch).toHaveBeenCalled());
		await act(async () => answer(Response.json(user("q-1"))));
		expect(await screen.findByText("q-1/queue")).toBeInTheDocument();
	});

	it("stays without a queue when signed out", async () => {
		mockApi({
			"GET /api/me": new Response(
				JSON.stringify({ error: "unauthorized", message: "Not signed in" }),
				{ status: 401, headers: { "content-type": "application/json" } },
			),
		});
		setup();
		await waitFor(() => expect(fetch).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(screen.getByText("nobody/no queue")).toBeInTheDocument();
	});

	it("drops cached data and pauses the old queue when the user changes", async () => {
		let me = user("c-1");
		mockApi({
			"GET /api/me": () => Response.json(me),
		});
		const client = setup();
		await screen.findByText("c-1/queue");
		client.setQueryData(["items", {}], { secret: "c-1's" });
		const pause = vi.spyOn(getUploadQueue("c-1"), "pause");

		me = user("c-2");
		await act(() => client.refetchQueries({ queryKey: ["me"] }));

		await screen.findByText("c-2/queue");
		await waitFor(() =>
			expect(client.getQueryData(["items", {}])).toBeUndefined(),
		);
		expect(client.getQueryData(["me"])).toEqual(user("c-2"));
		expect(pause).toHaveBeenCalled();
	});

	it("keeps the cache while the user stays the same", async () => {
		mockApi({ "GET /api/me": () => Response.json(user("s-1")) });
		const client = setup();
		await screen.findByText("s-1/queue");
		client.setQueryData(["items", {}], { kept: true });
		await act(() => client.refetchQueries({ queryKey: ["me"] }));
		expect(client.getQueryData(["items", {}])).toEqual({ kept: true });
	});
});
