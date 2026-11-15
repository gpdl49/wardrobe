import { OutfitDetail } from "@/components/outfits/outfit-detail";
export default async function Page({ params }: PageProps<"/outfits/[id]">) {
	const { id } = await params;
	return <OutfitDetail id={id} />;
}
