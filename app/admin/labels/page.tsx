import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Labels" };

export default function Page() {
	return (
		<>
			<PageHeader title="Labels" />
			<Placeholder>A printable sheet of QR labels for locations.</Placeholder>
		</>
	);
}
