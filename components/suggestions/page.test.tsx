// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import SuggestPage from "@/app/outfits/suggest/page";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";

it("explains when suggestions are switched off", async () => {
	mockApi({
		"GET /api/me": { features: { suggestions: false } },
		"GET /api/shared-with-me": [],
		"GET /api/items": { items: [], nextCursor: null },
		"GET /api/suggestion-runs": [],
	});
	renderWithQuery(<SuggestPage />);
	expect(
		await screen.findByText("Suggestions are switched off."),
	).toBeInTheDocument();
});
it("submits a request and displays the waiting state", async () => {
	const run = {
		id: "run-1",
		ownerId: "me",
		status: "queued",
		request: {},
		error: null,
		createdAt: "2026-01-01T00:00:00Z",
		suggestions: [],
	};
	const fetch = mockApi({
		"GET /api/me": { features: { suggestions: true } },
		"GET /api/shared-with-me": [],
		"GET /api/items": { items: [], nextCursor: null },
		"GET /api/suggestion-runs": [],
		"POST /api/suggestion-runs": run,
		"GET /api/suggestion-runs/run-1": run,
	});
	const user = userEvent.setup();
	renderWithQuery(<SuggestPage />);
	await user.type(
		screen.getByLabelText("What are you dressing for?"),
		"Dinner",
	);
	await user.click(screen.getByRole("button", { name: "Suggest outfits" }));
	expect(
		await screen.findByText(/Putting outfits together/),
	).toBeInTheDocument();
	expect(requests(fetch).find((r) => r.method === "POST")?.body).toMatchObject({
		prompt: "Dinner",
		count: 3,
	});
});
