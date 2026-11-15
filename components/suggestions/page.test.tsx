// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import SuggestPage from "@/app/outfits/suggest/page";
import type { SuggestionRunDto } from "@/lib/api/types";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { itemDetail } from "@/test/helpers/factories";

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

const proposalItem = itemDetail();
const proposal = {
	id: "suggestion-1",
	runId: "run-1",
	name: "Evening look",
	rationale: "A good match",
	items: [proposalItem],
	feedback: null,
	outfitId: null,
	createdAt: "2026-01-01T00:00:00Z",
};
const baseRun: SuggestionRunDto = {
	id: "run-1",
	ownerId: "me",
	status: "done",
	request: {},
	model: null,
	error: null,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
	suggestions: [proposal],
};
const commonRoutes = {
	"GET /api/me": { features: { suggestions: true } },
	"GET /api/shared-with-me": [],
	"GET /api/items": { items: [], nextCursor: null },
};

it("saves a proposal and shows its outfit link", async () => {
	let current = baseRun;
	const fetch = mockApi({
		...commonRoutes,
		"GET /api/suggestion-runs": () => [current],
		"POST /api/outfits": () => {
			current = {
				...baseRun,
				suggestions: [{ ...proposal, feedback: "saved", outfitId: "outfit-1" }],
			};
			return { id: "outfit-1" };
		},
	});
	const user = userEvent.setup();
	renderWithQuery(<SuggestPage />);
	await user.click(await screen.findByRole("button", { name: "Save" }));
	expect(
		await screen.findByRole("link", { name: "View saved outfit" }),
	).toHaveAttribute("href", "/outfits/outfit-1");
	expect(requests(fetch).find((r) => r.method === "POST")?.body).toEqual({
		name: "Evening look",
		itemIds: ["item-1"],
		suggestionId: "suggestion-1",
	});
	expect(screen.getByText("Evening look")).toBeInTheDocument();
});

it("dismisses a proposal and keeps it visible", async () => {
	let current = baseRun;
	const fetch = mockApi({
		...commonRoutes,
		"GET /api/suggestion-runs": () => [current],
		"POST /api/outfit-suggestions/suggestion-1/dismiss": () => {
			current = {
				...baseRun,
				suggestions: [{ ...proposal, feedback: "dismissed", outfitId: null }],
			};
			return current.suggestions[0];
		},
	});
	const user = userEvent.setup();
	renderWithQuery(<SuggestPage />);
	await user.click(await screen.findByRole("button", { name: "Dismiss" }));
	expect(await screen.findByText("Dismissed")).toBeInTheDocument();
	expect(screen.getByText("Evening look")).toBeInTheDocument();
	expect(
		requests(fetch).some(
			(r) =>
				r.method === "POST" &&
				r.path === "/api/outfit-suggestions/suggestion-1/dismiss",
		),
	).toBe(true);
});

it.each(["done", "failed"] as const)(
	"polls a newly created run until %s",
	async (status) => {
		let calls = 0;
		const queued = { ...baseRun, status: "queued", suggestions: [] };
		const settled = {
			...baseRun,
			status,
			error: status === "failed" ? "Model unavailable" : null,
			suggestions: status === "done" ? [proposal] : [],
		};
		const fetch = mockApi({
			...commonRoutes,
			"GET /api/suggestion-runs": [],
			"POST /api/suggestion-runs": queued,
			"GET /api/suggestion-runs/run-1": () =>
				++calls === 1 ? queued : settled,
		});
		const user = userEvent.setup();
		renderWithQuery(<SuggestPage />);
		await user.click(screen.getByRole("button", { name: "Suggest outfits" }));
		expect(
			await screen.findByText(/Putting outfits together/),
		).toBeInTheDocument();
		expect(
			await screen.findByText(
				status === "done" ? "Evening look" : "Model unavailable",
				{},
				{ timeout: 8000 },
			),
		).toBeInTheDocument();
		expect(
			requests(fetch).filter((r) => r.path === "/api/suggestion-runs/run-1")
				.length,
		).toBeGreaterThanOrEqual(2);
	},
);

it.each([
	["queued", "done"],
	["running", "failed"],
] as const)("polls a past %s run until %s", async (status, outcome) => {
	let calls = 0;
	const pending = { ...baseRun, status, suggestions: [] };
	const settled =
		outcome === "done"
			? baseRun
			: {
					...baseRun,
					status: "failed",
					error: "Model unavailable",
					suggestions: [],
				};
	const fetch = mockApi({
		...commonRoutes,
		"GET /api/suggestion-runs": [pending],
		"GET /api/suggestion-runs/run-1": () => (++calls === 1 ? pending : settled),
	});
	renderWithQuery(<SuggestPage />);
	expect(
		await screen.findByText(/Putting outfits together/),
	).toBeInTheDocument();
	expect(
		await screen.findByText(
			outcome === "done" ? "Evening look" : "Model unavailable",
			{},
			{ timeout: 8000 },
		),
	).toBeInTheDocument();
	expect(
		requests(fetch).filter((r) => r.path === "/api/suggestion-runs/run-1")
			.length,
	).toBeGreaterThanOrEqual(2);
});
