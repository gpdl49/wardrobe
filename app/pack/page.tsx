import type { Metadata } from "next";
import { PackFlow } from "@/components/pack/pack-flow";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Pack" };

const one = (value: string | string[] | undefined) =>
	typeof value === "string" && value ? value : undefined;

/** ?location=<id> starts packing it; ?code=<code> offers to create that label. */
export default async function Page({ searchParams }: PageProps<"/pack">) {
	const params = await searchParams;
	return (
		<>
			<PageHeader title="Pack" />
			<PackFlow
				initialLocationId={one(params.location)}
				initialCode={one(params.code)}
			/>
		</>
	);
}
