import { PageHeader, Placeholder } from "@/components/page-header";

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
	const { id } = await params;
	return (
		<>
			<PageHeader title="Item" />
			<Placeholder>
				Item <code>{id}</code>: photos, details, history and analysis are not
				built yet.
			</Placeholder>
		</>
	);
}
