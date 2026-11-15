// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { mockApi, renderWithQuery, requests } from "@/test/helpers/dom";
import { TaggingCard } from "./tagging-card";

it("queues and applies tags and reports the counts", async () => {
	const fetch = mockApi({
		"POST /api/items/analyses": { queued: 4 },
		"POST /api/items/analyses/apply-tags": { updated: 3 },
	});
	const user = userEvent.setup();
	renderWithQuery(<TaggingCard />);
	await user.click(
		screen.getByRole("button", { name: "Suggest tags for my wardrobe" }),
	);
	expect(await screen.findByText("4 items queued.")).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Apply suggestions" }));
	expect(await screen.findByText("3 items updated.")).toBeInTheDocument();
	expect(
		requests(fetch).find((r) => r.path === "/api/items/analyses/apply-tags")
			?.body,
	).toEqual({ fields: ["tags", "pattern", "material", "seasons"] });
});
