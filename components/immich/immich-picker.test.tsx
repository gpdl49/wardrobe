// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { ImmichPicker } from "./immich-picker";

const me = { features: { immich: true, vision: false, suggestions: false } };
const status = {
	enabled: true,
	connected: true,
	url: null,
	user: { id: "1", name: null, email: null },
};
const asset = (id: string) => ({
	id,
	fileName: `${id}.jpg`,
	thumbUrl: `/thumb/${id}`,
	thumbhash: null,
	width: null,
	height: null,
	takenAt: null,
});
function Picker() {
	const [open, setOpen] = useState(true);
	return (
		<ImmichPicker
			open={open}
			onOpenChange={setOpen}
			onPick={() => Promise.reject(new Error("Could not link"))}
		/>
	);
}
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("links to settings when disconnected", async () => {
	const fetch = mockApi({
		"GET /api/me": me,
		"GET /api/immich": { ...status, connected: false, user: null },
	});
	renderWithQuery(
		<ImmichPicker open onOpenChange={vi.fn()} onPick={vi.fn()} />,
	);
	expect(await screen.findByRole("link", { name: "Settings" })).toHaveAttribute(
		"href",
		"/settings",
	);
	expect(requests(fetch).some((r) => r.path === "/api/immich/assets")).toBe(
		false,
	);
});
it("searches, pages, selects and awaits confirmation", async () => {
	let calls = 0;
	const fetch = mockApi({
		"GET /api/me": me,
		"GET /api/immich": status,
		"GET /api/immich/assets": () =>
			++calls < 3
				? { assets: [asset("a"), asset("b")], nextCursor: "next" }
				: { assets: [asset("c")], nextCursor: null },
	});
	const user = userEvent.setup();
	let resolve!: () => void;
	const pick = vi.fn(
		() =>
			new Promise<void>((r) => {
				resolve = r;
			}),
	);
	const close = vi.fn();
	renderWithQuery(<ImmichPicker open onOpenChange={close} onPick={pick} />);
	await user.click(await screen.findByRole("button", { name: "a.jpg" }));
	await user.click(screen.getByRole("button", { name: "b.jpg" }));
	await user.type(screen.getByLabelText("Search photos"), "coat");
	await waitFor(() =>
		expect(requests(fetch).some((r) => r.search.includes("q=coat"))).toBe(true),
	);
	await user.click(screen.getByRole("button", { name: "Load more" }));
	await waitFor(() =>
		expect(requests(fetch).some((r) => r.search.includes("cursor=next"))).toBe(
			true,
		),
	);
	await user.click(screen.getByRole("button", { name: "Add 2 selected" }));
	expect(pick).toHaveBeenCalledWith(["a", "b"]);
	expect(close).not.toHaveBeenCalled();
	resolve();
	await waitFor(() => expect(close).toHaveBeenCalledWith(false));
});
it("shows a rejected selection", async () => {
	mockApi({
		"GET /api/me": me,
		"GET /api/immich": status,
		"GET /api/immich/assets": { assets: [asset("a")], nextCursor: null },
	});
	const user = userEvent.setup();

	renderWithQuery(<Picker />);
	await user.click(await screen.findByRole("button", { name: "a.jpg" }));
	await user.click(screen.getByRole("button", { name: "Add 1 selected" }));
	expect(await screen.findByRole("alert")).toHaveTextContent("Could not link");
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
