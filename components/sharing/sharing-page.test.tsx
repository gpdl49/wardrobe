// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShareDto, SharedWithMeDto } from "@/lib/api/types";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { location } from "@/test/helpers/factories";
import { SharingPage } from "./sharing-page";

const at = "2026-11-01T10:00:00.000Z";
const myShare: ShareDto = {
	id: "share-1",
	ownerId: "me",
	grantee: { id: "anna", email: "anna@x", username: "anna" },
	access: "view",
	location: null,
	createdAt: at,
	updatedAt: at,
};
const wholeWardrobe: SharedWithMeDto = {
	id: "in-1",
	owner: { id: "ben", email: "ben@x", username: "ben" },
	access: "edit",
	location: null,
};
const oneLocation: SharedWithMeDto = {
	id: "in-2",
	owner: { id: "cleo", email: null, username: "cleo" },
	access: "view",
	location: { id: "loc-9", code: "B-09", name: "Cleo's bag" },
};

const routes = (over: Record<string, unknown> = {}) => ({
	"GET /api/shares": [myShare],
	"GET /api/shared-with-me": [wholeWardrobe, oneLocation],
	"GET /api/locations": [
		location({ id: "loc-1", code: "B-01", name: "Winter" }),
	],
	...over,
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("SharingPage", () => {
	it("lists your shares and what is shared with you, linking into it", async () => {
		mockApi(routes());
		renderWithQuery(<SharingPage />);

		const yours = await screen.findByRole("region", { name: "What you share" });
		expect(await within(yours).findByText("anna")).toBeInTheDocument();
		expect(within(yours).getByText("Whole wardrobe")).toBeInTheDocument();

		const shared = screen.getByRole("region", { name: "Shared with you" });
		expect(
			await within(shared).findByRole("link", { name: /ben/ }),
		).toHaveAttribute("href", "/?owner=ben");
		expect(within(shared).getByRole("link", { name: /cleo/ })).toHaveAttribute(
			"href",
			"/locations/loc-9",
		);
	});

	it("shares a location with someone", async () => {
		const fetch = mockApi(
			routes({ "POST /api/shares": Response.json(myShare, { status: 201 }) }),
		);
		const user = userEvent.setup();
		renderWithQuery(<SharingPage />);
		await screen.findByRole("option", { name: /B-01/ });

		await user.type(screen.getByLabelText(/Email or username/), " anna@x ");
		await user.selectOptions(screen.getByLabelText("What"), "loc-1");
		await user.selectOptions(screen.getByLabelText("Access"), "edit");
		await user.click(screen.getByRole("button", { name: "Share" }));

		await waitFor(() =>
			expect(requests(fetch).find((r) => r.method === "POST")?.body).toEqual({
				grantee: "anna@x",
				access: "edit",
				locationId: "loc-1",
			}),
		);
	});

	it("shares the whole wardrobe when no location is chosen", async () => {
		const fetch = mockApi(
			routes({ "POST /api/shares": Response.json(myShare, { status: 201 }) }),
		);
		const user = userEvent.setup();
		renderWithQuery(<SharingPage />);
		await user.type(screen.getByLabelText(/Email or username/), "anna");
		await user.click(screen.getByRole("button", { name: "Share" }));
		await waitFor(() =>
			expect(requests(fetch).find((r) => r.method === "POST")?.body).toEqual({
				grantee: "anna",
				access: "view",
			}),
		);
	});

	it("shows why a share was refused", async () => {
		mockApi(
			routes({
				"POST /api/shares": Response.json(
					{ error: "unprocessable", message: "Nobody by that name" },
					{ status: 422 },
				),
			}),
		);
		const user = userEvent.setup();
		renderWithQuery(<SharingPage />);
		await user.type(screen.getByLabelText(/Email or username/), "nobody");
		await user.click(screen.getByRole("button", { name: "Share" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Nobody by that name",
		);
	});

	it("changes access and revokes", async () => {
		const fetch = mockApi(
			routes({
				"PATCH /api/shares/share-1": { ...myShare, access: "edit" },
				"DELETE /api/shares/share-1": new Response(null, { status: 204 }),
			}),
		);
		const user = userEvent.setup();
		renderWithQuery(<SharingPage />);

		await user.selectOptions(
			await screen.findByLabelText(/Access for anna/),
			"edit",
		);
		await waitFor(() =>
			expect(requests(fetch).find((r) => r.method === "PATCH")?.body).toEqual({
				access: "edit",
			}),
		);

		await user.click(
			screen.getByRole("button", { name: /Stop sharing Whole wardrobe/ }),
		);
		await user.click(
			await screen.findByRole("button", { name: "Stop sharing" }),
		);
		await waitFor(() =>
			expect(requests(fetch).some((r) => r.method === "DELETE")).toBe(true),
		);
	});

	it("explains empty lists", async () => {
		mockApi(routes({ "GET /api/shares": [], "GET /api/shared-with-me": [] }));
		renderWithQuery(<SharingPage />);
		expect(
			await screen.findByText("Not shared with anyone"),
		).toBeInTheDocument();
		expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
	});
});
