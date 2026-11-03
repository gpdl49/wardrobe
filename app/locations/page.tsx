import type { Metadata } from "next";
import { LocationsList } from "@/components/locations/locations-list";

export const metadata: Metadata = { title: "Locations" };

export default function Page() {
	return <LocationsList />;
}
