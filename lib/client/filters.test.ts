import { describe, expect, it } from "vitest";
import {
	activeFilterCount,
	DEFAULT_FILTERS,
	parseFilters,
	serializeFilters,
	toItemsQuery,
} from "./filters";

describe("catalogue filters", () => {
	it("parses known values and drops invalid ones", () => {
		const filters = parseFilters(
			new URLSearchParams(
				"q=+wool+&season=winter&status=nope&tag=Linen&view=list&group=shelf&color=Navy",
			),
		);
		expect(filters).toEqual({
			...DEFAULT_FILTERS,
			q: "wool",
			season: "winter",
			tag: "linen",
			color: "navy",
			view: "list",
		});
	});

	it("round-trips and leaves defaults out of the URL", () => {
		const filters = {
			...DEFAULT_FILTERS,
			location: "loc-1",
			status: "stored" as const,
			group: "category" as const,
		};
		const qs = serializeFilters(filters);
		expect(qs).toBe("location=loc-1&status=stored&group=category");
		expect(parseFilters(new URLSearchParams(qs))).toEqual(filters);
		expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
	});

	it("maps to the items API query without presentation keys", () => {
		expect(
			toItemsQuery({
				...DEFAULT_FILTERS,
				q: "coat",
				color: "navy",
				view: "list",
			}),
		).toEqual({ q: "coat", color: "navy" });
	});

	it("counts active filters other than search", () => {
		expect(
			activeFilterCount({
				...DEFAULT_FILTERS,
				q: "x",
				tag: "a",
				season: "summer",
			}),
		).toBe(2);
	});
});
