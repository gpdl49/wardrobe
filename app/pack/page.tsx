import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Pack" };

export default function Page() {
	return (
		<>
			<PageHeader title="Pack" />
			<Placeholder>
				Scan or pick a location, then capture items rapidly.
			</Placeholder>
		</>
	);
}
