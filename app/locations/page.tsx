import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Locations" };

export default function Page() {
	return (
		<>
			<PageHeader title="Locations" />
			<Placeholder>
				Bags, suitcases and closets will be listed here.
			</Placeholder>
		</>
	);
}
