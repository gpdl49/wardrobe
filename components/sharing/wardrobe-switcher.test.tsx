// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedWithMeDto } from "@/lib/api/types";
import { mockApi, renderWithQuery } from "@/test/helpers/dom";
import { sharedWardrobes, WardrobeSwitcher } from "./wardrobe-switcher";

const anna = { id: "anna", email: "anna@x", username: "anna" };
const ben = { id: "ben", email: "ben@x", username: null };
const whole: SharedWithMeDto = {
	id: "s1",
	owner: anna,
	access: "view",
	location: null,
};
const place = (id: string): SharedWithMeDto => ({
	id,
	owner: ben,
	access: "edit",
	location: { id, code: id, name: id },
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("sharedWardrobes", () => {
	it("makes one entry per person", () => {
		expect(sharedWardrobes([whole, place("a"), place("b")])).toEqual([
			{ id: "anna", label: "anna's wardrobe" },
			{ id: "ben", label: "ben@x: 2 shared locations" },
		]);
	});

	it("prefers the whole wardrobe over a location of the same person", () => {
		expect(
			sharedWardrobes([
				{ ...whole, id: "s2", location: { id: "x", code: "x", name: "x" } },
				whole,
			]),
		).toEqual([{ id: "anna", label: "anna's wardrobe" }]);
	});
});

describe("WardrobeSwitcher", () => {
	it("renders nothing while nothing is shared", async () => {
		const fetch = mockApi({ "GET /api/shared-with-me": [] });
		const { container } = renderWithQuery(
			<WardrobeSwitcher value="" onChange={vi.fn()} />,
		);
		await waitFor(() => expect(fetch).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(container).toBeEmptyDOMElement();
	});

	it("offers your own and shared wardrobes", async () => {
		mockApi({ "GET /api/shared-with-me": [whole, place("a")] });
		const onChange = vi.fn();
		renderWithQuery(<WardrobeSwitcher value="" onChange={onChange} />);
		const select = await screen.findByRole("combobox", { name: "Wardrobe" });
		await screen.findByRole("option", { name: "anna's wardrobe" });
		expect(screen.getByRole("option", { name: "My wardrobe" })).toBeVisible();

		await userEvent.selectOptions(select, "anna");
		expect(onChange).toHaveBeenCalledWith("anna");
	});

	it("lets you get back when viewing a wardrobe no longer shared", async () => {
		mockApi({ "GET /api/shared-with-me": [] });
		renderWithQuery(<WardrobeSwitcher value="gone" onChange={vi.fn()} />);
		expect(
			await screen.findByRole("option", { name: "My wardrobe" }),
		).toBeInTheDocument();
		expect(screen.getByRole("combobox")).toHaveValue("gone");
	});
});
