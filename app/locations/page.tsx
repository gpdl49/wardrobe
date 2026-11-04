import type { Metadata } from "next";
import { Suspense } from "react";
import { LocationsList } from "@/components/locations/locations-list";
import { Loading } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Locations" };

export default function Page() {
	return (
		// The wardrobe being viewed lives in the query string (useSearchParams).
		<Suspense fallback={<Loading />}>
			<LocationsList />
		</Suspense>
	);
}
