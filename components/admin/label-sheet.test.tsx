// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { location } from "@/test/helpers/factories";
import { LabelSheet, labelUrl, PER_SHEET, paginate } from "./label-sheet";
import { qrPath } from "./qr-code";

const locations = Array.from({ length: 26 }, (_, i) =>
	location({
		id: `loc-${i}`,
		code: `B-${String(i + 1).padStart(2, "0")}`,
		name: i === 0 ? "Winter jumpers" : `B-${String(i + 1).padStart(2, "0")}`,
	}),
);

describe("label sheet", () => {
	it("encodes the public /l/<ownerId>/<code> URL", () => {
		expect(labelUrl("owner-1", "CL-BEDROOM")).toBe(
			"https://wardrobe.vidur.xyz/l/owner-1/CL-BEDROOM",
		);
	});

	it("draws a QR code with a quiet zone", () => {
		const { d, size } = qrPath(
			labelUrl("019a0000-0000-7000-8000-000000000001", "B-07"),
		);
		// Version 5 (37 modules) for this URL at ECC M, plus 2 modules each side.
		expect(size).toBe(41);
		expect(d.startsWith("M2 2h1v1h-1z")).toBe(true);
	});

	it("paginates 24 labels per A4 sheet after skipped positions", () => {
		const pages = paginate(locations, 3);
		expect(PER_SHEET).toBe(24);
		expect(pages.map((p) => p.length)).toEqual([24, 5]);
		expect(pages[0]?.slice(0, 4).map((c) => c?.code ?? null)).toEqual([
			null,
			null,
			null,
			"B-01",
		]);
	});

	it("renders one label per location with code, name and QR", () => {
		render(<LabelSheet locations={locations} skip={1} />);
		const sheets = screen.getAllByRole("region", { name: /^Sheet/ });
		expect(sheets).toHaveLength(2);
		const labels = screen.getAllByTestId("label");
		expect(labels).toHaveLength(26);
		const first = labels[0] as HTMLElement;
		expect(within(first).getByText("B-01")).toBeInTheDocument();
		expect(within(first).getByText("Winter jumpers")).toBeInTheDocument();
		expect(
			within(first).getByRole("img", {
				name: "QR code for https://wardrobe.vidur.xyz/l/user-1/B-01",
			}),
		).toBeInTheDocument();
		// The name is not repeated when it is just the code.
		expect(within(labels[1] as HTMLElement).getAllByText("B-02")).toHaveLength(
			1,
		);
		// One blank position before the first label on sheet 1.
		expect((sheets[0] as HTMLElement).children).toHaveLength(24);
		expect((sheets[0] as HTMLElement).firstElementChild).toHaveAttribute(
			"aria-hidden",
		);
	});
});
