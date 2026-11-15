// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { SettingsPage } from "./settings-page";

const me = { features: { immich: true, vision: false, suggestions: false } };
const disconnected = { enabled: true, connected: false, url: null, user: null };
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("explains when Immich is disabled without calling its API", async () => {
	const fetch = mockApi({
		"GET /api/me": { features: { ...me.features, immich: false } },
	});
	renderWithQuery(<SettingsPage />);
	expect(await screen.findByText(/not enabled/)).toBeInTheDocument();
	expect(requests(fetch).some((r) => r.path === "/api/immich")).toBe(false);
});
it("submits a password key and shows rejection inline", async () => {
	const fetch = mockApi({
		"GET /api/me": me,
		"GET /api/immich": disconnected,
		"PUT /api/immich": Response.json(
			{ error: "immich_key_rejected", message: "Key rejected" },
			{ status: 422 },
		),
	});
	const user = userEvent.setup();
	renderWithQuery(<SettingsPage />);
	const input = await screen.findByLabelText("Immich API key");
	expect(input).toHaveAttribute("type", "password");
	await user.type(input, "secret");
	await user.click(screen.getByRole("button", { name: "Connect" }));
	expect(await screen.findByRole("alert")).toHaveTextContent("Key rejected");
	expect(requests(fetch).find((r) => r.method === "PUT")?.body).toEqual({
		apiKey: "secret",
	});
});
it("confirms disconnect and describes linked photos", async () => {
	const fetch = mockApi({
		"GET /api/me": me,
		"GET /api/immich": {
			...disconnected,
			connected: true,
			user: { id: "1", name: "A", email: "a@example.com" },
		},
		"DELETE /api/immich": new Response(null, { status: 204 }),
	});
	const user = userEvent.setup();
	renderWithQuery(<SettingsPage />);
	expect(await screen.findByText(/Connected as A/)).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Disconnect" }));
	expect(screen.getByText(/photos you linked/i)).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Disconnect" }));
	await waitFor(() =>
		expect(requests(fetch).some((r) => r.method === "DELETE")).toBe(true),
	);
});
it("clears the key after connecting", async () => {
	let connected = false;
	const next = {
		...disconnected,
		connected: true,
		user: { id: "1", name: "A", email: null },
	};
	mockApi({
		"GET /api/me": me,
		"GET /api/immich": () => (connected ? next : disconnected),
		"PUT /api/immich": () => {
			connected = true;
			return next;
		},
	});
	const user = userEvent.setup();
	renderWithQuery(<SettingsPage />);
	const input = await screen.findByLabelText("Immich API key");
	await user.type(input, "secret");
	await user.click(screen.getByRole("button", { name: "Connect" }));
	expect(await screen.findByText(/Connected as A/)).toBeInTheDocument();
	expect(input).toHaveValue("");
});
