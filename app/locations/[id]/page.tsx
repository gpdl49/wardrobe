import { PageHeader, Placeholder } from "@/components/page-header";

export default async function LocationPage({
	params,
}: PageProps<"/locations/[id]">) {
	const { id } = await params;
	return (
		<>
			<PageHeader title="Location" />
			<Placeholder>
				Contents of location <code>{id}</code> (printable) are not built yet.
			</Placeholder>
		</>
	);
}
