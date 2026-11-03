import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UnpackFlow } from "@/components/unpack/unpack-flow";

export const metadata: Metadata = { title: "Unpack" };

/** ?location=<id> opens that location straight away. */
export default async function Page({ searchParams }: PageProps<"/unpack">) {
	const { location } = await searchParams;
	return (
		<>
			<PageHeader title="Unpack" />
			<UnpackFlow
				initialLocationId={typeof location === "string" ? location : undefined}
			/>
		</>
	);
}
