import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Catalogue" };

export default function Page() {
	return (
		<>
			<PageHeader title="Catalogue" />
			<Placeholder>
				The catalogue (grid/list with filters by location, category, tag,
				season, colour, status and search) is not built yet.
			</Placeholder>
		</>
	);
}
