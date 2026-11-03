import type { Metadata } from "next";
import { LocationDetail } from "@/components/locations/location-detail";

export const metadata: Metadata = { title: "Location" };

export default async function LocationPage({
	params,
}: PageProps<"/locations/[id]">) {
	const { id } = await params;
	return <LocationDetail id={id} />;
}
