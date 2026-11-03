import type { Metadata } from "next";
import { Suspense } from "react";
import { Catalogue } from "@/components/catalogue/catalogue";
import { PageHeader } from "@/components/page-header";
import { Loading } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Catalogue" };

export default function Page() {
	return (
		<>
			<PageHeader title="Catalogue" />
			{/* The filters live in the query string (useSearchParams). */}
			<Suspense fallback={<Loading />}>
				<Catalogue />
			</Suspense>
		</>
	);
}
