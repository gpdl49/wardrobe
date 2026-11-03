import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
	return (
		<>
			<PageHeader title="Categories" />
			<Placeholder>Edit the category tree.</Placeholder>
		</>
	);
}
