import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Unpack" };

export default function Page() {
	return (
		<>
			<PageHeader title="Unpack" />
			<Placeholder>Scan a location and take items out of it.</Placeholder>
		</>
	);
}
