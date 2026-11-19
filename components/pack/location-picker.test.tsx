// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocationDto, MeDto } from "@/lib/api/types";
import { CurrentUserContext } from "@/lib/client/current-user";
import type { ParsedLabel } from "@/lib/client/qr";
import { mockApi, requests } from "@/test/helpers/dom";
import { location } from "@/test/helpers/factories";
import { LocationPicker } from "./location-picker";

const scanned = vi.hoisted(() => ({
	label: null as ParsedLabel | null,
}));

vi.mock("@/components/scan/qr-scanner", () => ({
	QrScanner: ({ onCode }: { onCode: (label: ParsedLabel) => void }) => (
		<button type="button" onClick={() => onCode(scanned.label as ParsedLabel)}>
			fake scan
		</button>
	),
}));

const ME = "019a0000-0000-7000-8000-00000000000a";
const ANNA = "019a0000-0000-7000-8000-00000000000b";
const me: MeDto = {
	id: ME,
	sub: "s",
	email: null,
	username: "me",
	groups: ["wardrobe"],
	isAdmin: false,
	features: { vision: false, suggestions: false, immich: false },
};
const notFound = () =>
	Response.json({ error: "not_found", message: "nope" }, { status: 404 });

function setup(
	routes: Record<string, unknown>,
	props: Partial<Parameters<typeof LocationPicker>[0]> = {},
) {
	const fetch = mockApi({
		"GET /api/locations": [],
		"GET /api/shared-with-me": [],
		...routes,
	});
	const onChoose = vi.fn<(location: LocationDto) => void>();
	render(
		<CurrentUserContext.Provider value={me}>
			<LocationPicker allowCreate onChoose={onChoose} {...props} />
		</CurrentUserContext.Provider>,
	);
	return { fetch, onChoose, user: userEvent.setup() };
}

const scan = async (
	user: ReturnType<typeof userEvent.setup>,
	label: ParsedLabel,
) => {
	scanned.label = label;
	await user.click(screen.getByRole("button", { name: "Scan label" }));
	await user.click(screen.getByRole("button", { name: "fake scan" }));
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("LocationPicker labels", () => {
	it("resolves a label in its owner's wardrobe", async () => {
		const bag = location({ code: "B-07", ownerId: ANNA, access: "edit" });
		const { fetch, onChoose, user } = setup({
			"GET /api/locations/by-code/B-07": bag,
		});
		await scan(user, { ownerId: ANNA, code: "B-07" });
		await waitFor(() => expect(onChoose).toHaveBeenCalledWith(bag));
		const call = requests(fetch).find((r) => r.path.includes("by-code"));
		expect(call?.search).toBe(`?owner=${ANNA}`);
	});

	it("offers to create your own unknown code", async () => {
		const { user } = setup({
			"GET /api/locations/by-code/B-07": notFound,
		});
		await scan(user, { ownerId: ME, code: "B-07" });
		expect(
			await screen.findByRole("button", { name: "Create bag B-07" }),
		).toBeInTheDocument();
	});

	it("offers to create a typed code, which means your own", async () => {
		setup(
			{ "GET /api/locations/by-code/B-07": notFound },
			{ initialCode: "B-07" },
		);
		expect(
			await screen.findByRole("button", { name: "Create bag B-07" }),
		).toBeInTheDocument();
	});

	it("does not offer to create someone else's code", async () => {
		const { user } = setup({
			"GET /api/locations/by-code/B-07": notFound,
		});
		await scan(user, { ownerId: ANNA, code: "B-07" });
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/isn't shared with you/,
		);
		expect(
			screen.queryByRole("button", { name: /Create bag/ }),
		).not.toBeInTheDocument();
	});

	it("refuses a view-only location", async () => {
		const { onChoose, user } = setup({
			"GET /api/locations/by-code/B-07": location({
				code: "B-07",
				ownerId: ANNA,
				access: "view",
			}),
		});
		await scan(user, { ownerId: ANNA, code: "B-07" });
		expect(await screen.findByRole("alert")).toHaveTextContent(/view access/);
		expect(onChoose).not.toHaveBeenCalled();
	});

	it("refuses a label from another wardrobe when pinned to one owner", async () => {
		const { fetch, onChoose, user } = setup({}, { ownerId: ANNA });
		await scan(user, { ownerId: ME, code: "B-07" });
		expect(await screen.findByRole("alert")).toHaveTextContent(
			/another wardrobe/,
		);
		expect(onChoose).not.toHaveBeenCalled();
		expect(requests(fetch).some((r) => r.path.includes("by-code"))).toBe(false);
	});
});

describe("LocationPicker lists", () => {
	it("creates the next numbered vacuum bag for packing", async () => {
		const next = location({
			kind: "vacuum_bag",
			code: "V-03",
			name: "Vacuum bag V-03",
		});
		const { fetch, onChoose, user } = setup({
			"GET /api/locations": [location({ kind: "vacuum_bag", code: "V-02" })],
			"POST /api/locations": next,
		});
		await user.click(
			await screen.findByRole("button", { name: "New vacuum bag V-03" }),
		);
		await waitFor(() => expect(onChoose).toHaveBeenCalledWith(next));
		expect(requests(fetch).find((r) => r.method === "POST")?.body).toEqual({
			kind: "vacuum_bag",
			code: "V-03",
			name: "Vacuum bag V-03",
		});
	});

	it("lists the pinned owner's locations, without new ones or a choice of wardrobe", async () => {
		const { fetch } = setup(
			{ "GET /api/locations": [location({ ownerId: ANNA, access: "edit" })] },
			{ ownerId: ANNA },
		);
		await screen.findByRole("button", { name: /B-01/ });
		const list = requests(fetch).find((r) => r.path === "/api/locations");
		expect(list?.search).toContain(`owner=${ANNA}`);
		expect(
			screen.queryByRole("button", { name: /^New bag/ }),
		).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Wardrobe")).not.toBeInTheDocument();
	});

	it("leaves view-only locations out", async () => {
		setup({
			"GET /api/locations": [
				location({ id: "a", code: "B-01", access: "edit" }),
				location({ id: "b", code: "B-02", access: "view" }),
			],
		});
		await screen.findByRole("button", { name: /B-01/ });
		expect(
			screen.queryByRole("button", { name: /B-02/ }),
		).not.toBeInTheDocument();
	});

	it("switches to a shared wardrobe, and stops offering new bags there", async () => {
		const { fetch, user } = setup({
			"GET /api/shared-with-me": [
				{
					id: "s",
					owner: { id: ANNA, email: null, username: "anna" },
					access: "edit",
					location: null,
				},
			],
		});
		expect(
			await screen.findByRole("button", { name: /^New bag/ }),
		).toBeInTheDocument();
		await user.selectOptions(await screen.findByLabelText("Wardrobe"), ANNA);
		await waitFor(() =>
			expect(
				requests(fetch).some((r) => r.search.includes(`owner=${ANNA}`)),
			).toBe(true),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("button", { name: /^New bag/ }),
			).not.toBeInTheDocument(),
		);
	});
});
