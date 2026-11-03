// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { suggestTags, TagInput } from "./tag-input";

const tags = [
	{ name: "wool", count: 5 },
	{ name: "work", count: 9 },
	{ name: "linen", count: 2 },
	{ name: "knitwear", count: 1 },
];

function Harness({ initial = [] as string[] }) {
	const [value, setValue] = useState(initial);
	return (
		<>
			<TagInput value={value} onChange={setValue} suggestions={tags} />
			<output data-testid="value">{value.join("|")}</output>
		</>
	);
}

const value = () => screen.getByTestId("value").textContent;

describe("suggestTags", () => {
	it("ranks prefix matches first, then by count, and skips chosen tags", () => {
		expect(suggestTags(tags, "w", []).map((t) => t.name)).toEqual([
			"work",
			"wool",
			"knitwear",
		]);
		expect(suggestTags(tags, "", ["work"]).map((t) => t.name)).toEqual([
			"wool",
			"linen",
			"knitwear",
		]);
	});
});

describe("TagInput", () => {
	it("adds typed tags normalised on Enter and comma", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		const input = screen.getByRole("combobox", { name: "Tags" });
		await user.type(input, "  Party Wear {Enter}");
		await user.type(input, "Summer,");
		expect(value()).toBe("party wear|summer");
	});

	it("suggests existing tags and picks one with the keyboard", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		await user.type(screen.getByRole("combobox"), "wo");
		const list = screen.getByRole("listbox");
		expect(
			within(list)
				.getAllByRole("option")
				.map((o) => o.textContent),
		).toEqual(["work9", "wool5"]);
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(value()).toBe("wool");
	});

	it("picks a suggestion with a click", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: /linen/ }));
		expect(value()).toBe("linen");
	});

	it("removes tags with the chip button and Backspace, ignoring duplicates", async () => {
		const user = userEvent.setup();
		render(<Harness initial={["wool", "work", "linen"]} />);
		await user.click(screen.getByRole("button", { name: "Remove work" }));
		expect(value()).toBe("wool|linen");
		await user.type(screen.getByRole("combobox"), "WOOL{Enter}");
		expect(value()).toBe("wool|linen");
		await user.keyboard("{Backspace}");
		expect(value()).toBe("wool");
	});
});
