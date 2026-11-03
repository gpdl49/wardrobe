// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { analysis, itemDetail } from "@/test/helpers/factories";
import { SuggestionsPanel } from "./suggestions-panel";

const categories = [
	{
		id: "c1",
		name: "Outerwear",
		slug: "outerwear",
		parentId: null,
		sortOrder: 0,
	},
	{ id: "c2", name: "Coats", slug: "coats", parentId: "c1", sortOrder: 0 },
];

const item = itemDetail({
	brand: "Uniqlo",
	analyses: [
		analysis({
			result: {
				categorySlug: "coats",
				brand: "Uniqlo",
				material: "Wool",
				seasons: ["autumn", "winter"],
				labelText: "80% wool",
			},
		}),
	],
});

describe("SuggestionsPanel", () => {
	it("shows each suggested field and marks those the item already has", async () => {
		mockApi({ "GET /api/categories": categories });
		renderWithQuery(<SuggestionsPanel item={item} />);
		expect(await screen.findByText("Outerwear › Coats")).toBeInTheDocument();
		expect(screen.getByLabelText("Brand matches")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Accept Material" }),
		).toBeEnabled();
		expect(screen.getByText("80% wool")).toBeInTheDocument();
	});

	it("accepts one field, then all remaining fields", async () => {
		const fetch = mockApi({
			"GET /api/categories": categories,
			"POST /api/items/item-1/analyses/an-1/apply": { id: "item-1" },
			"GET /api/items/item-1": item,
		});
		const user = userEvent.setup();
		renderWithQuery(<SuggestionsPanel item={item} />);

		await user.click(screen.getByRole("button", { name: "Accept Material" }));
		await waitFor(() =>
			expect(requests(fetch).filter((r) => r.method === "POST")).toHaveLength(
				1,
			),
		);
		await user.click(screen.getByRole("button", { name: /Accept all \(3\)/ }));
		await waitFor(() =>
			expect(requests(fetch).filter((r) => r.method === "POST")).toHaveLength(
				2,
			),
		);
		const posts = requests(fetch).filter((r) => r.method === "POST");
		expect(posts[0]).toMatchObject({
			path: "/api/items/item-1/analyses/an-1/apply",
			body: { fields: ["material"] },
		});
		expect(posts[1]?.body).toEqual({
			fields: ["categorySlug", "material", "seasons"],
		});
	});

	it("shows the API error when applying fails", async () => {
		mockApi({
			"GET /api/categories": categories,
			"POST /api/items/item-1/analyses/an-1/apply": Response.json(
				{ error: "unprocessable", message: "Unknown category coats" },
				{ status: 422 },
			),
		});
		const user = userEvent.setup();
		renderWithQuery(<SuggestionsPanel item={item} />);
		await user.click(screen.getByRole("button", { name: "Accept Category" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Unknown category coats",
		);
	});

	it("re-runs analysis and explains when the server does not support it", async () => {
		const fetch = mockApi({ "GET /api/categories": categories });
		const user = userEvent.setup();
		renderWithQuery(<SuggestionsPanel item={item} />);
		await user.click(screen.getByRole("button", { name: "Re-run analysis" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(/not available/);
		expect(requests(fetch)).toContainEqual(
			expect.objectContaining({
				method: "POST",
				path: "/api/items/item-1/analyses",
			}),
		);
	});

	it("shows running and failed analyses without accept buttons", () => {
		mockApi({ "GET /api/categories": categories });
		renderWithQuery(
			<SuggestionsPanel
				item={itemDetail({
					analyses: [
						analysis({ id: "a", status: "running" }),
						analysis({
							id: "b",
							status: "failed",
							error: "Model timed out",
							createdAt: "2026-10-01T00:00:00.000Z",
						}),
					],
				})}
			/>,
		);
		const list = screen.getAllByRole("listitem");
		expect(
			within(list[0] as HTMLElement).getByText("Running"),
		).toBeInTheDocument();
		expect(
			within(list[1] as HTMLElement).getByText("Model timed out"),
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^Accept/ })).toBeNull();
		expect(screen.getByRole("button", { name: /Analysing/ })).toBeDisabled();
	});
});
