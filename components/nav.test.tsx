// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryAdmin } from "@/components/admin/category-admin";
import { MobileMenu, TopNav } from "@/components/nav";
import { navItemsFor } from "@/components/nav-items";
import type { MeDto } from "@/lib/api/types";
import { CurrentUserContext } from "@/lib/client/current-user";
import { renderWithQuery } from "@/test/helpers/dom";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/admin/category-tree-editor", () => ({
	CategoryTreeEditor: () => <p>the editor</p>,
}));

const me = (isAdmin: boolean): MeDto => ({
	id: "u",
	sub: "s",
	email: null,
	username: "u",
	groups: ["wardrobe"],
	isAdmin,
	features: { vision: false, suggestions: false, immich: false },
});

afterEach(cleanup);

describe("navigation", () => {
	it("lists Sharing for everyone and Categories only for admins", () => {
		const hrefs = (admin: boolean) => navItemsFor(admin).map((i) => i.href);
		expect(hrefs(false)).toContain("/sharing");
		expect(hrefs(false)).not.toContain("/admin/categories");
		expect(hrefs(true)).toContain("/admin/categories");
	});

	it.each([
		[me(false), false],
		[null, false],
		[me(true), true],
	])("shows the admin link for %j: %s", (user, shown) => {
		render(
			<CurrentUserContext.Provider value={user}>
				<TopNav />
				<MobileMenu />
			</CurrentUserContext.Provider>,
		);
		expect(
			screen.queryAllByRole("link", { name: "Categories", hidden: true }),
		).toHaveLength(shown ? 2 : 0);
		expect(
			screen.getAllByRole("link", { name: "Sharing", hidden: true }),
		).toHaveLength(2);
	});
});

describe("CategoryAdmin", () => {
	const show = (user: MeDto | null) =>
		renderWithQuery(
			<CurrentUserContext.Provider value={user}>
				<CategoryAdmin />
			</CurrentUserContext.Provider>,
		);

	it("tells non-admins it is not for them", () => {
		show(me(false));
		expect(screen.getByText("Admins only")).toBeInTheDocument();
		expect(screen.queryByText("the editor")).not.toBeInTheDocument();
	});

	it("shows admins the editor", () => {
		show(me(true));
		expect(screen.getByText("the editor")).toBeInTheDocument();
	});

	it("shows neither until the user is known", () => {
		show(null);
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByText("the editor")).not.toBeInTheDocument();
		expect(screen.queryByText("Admins only")).not.toBeInTheDocument();
	});
});
