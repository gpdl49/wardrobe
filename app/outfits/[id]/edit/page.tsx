import { EditOutfit } from "@/components/outfits/outfit-form";
export default async function Page({
	params,
}: PageProps<"/outfits/[id]/edit">) {
	const { id } = await params;
	return <EditOutfit id={id} />;
}
