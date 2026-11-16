// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { itemDetail } from "@/test/helpers/factories";
import { ItemCard } from "./item-tile";

it.each([true, false])(
	"renders generated=%s names at the appropriate opacity",
	(nameGenerated) => {
		render(<ItemCard item={itemDetail({ nameGenerated })} />);
		expect(screen.getByText("Navy coat")).toHaveStyle({
			opacity: nameGenerated ? "0.6" : "1",
		});
	},
);
