import type { Metadata } from "next";
import { ItemDetail } from "@/components/items/item-detail";

export const metadata: Metadata = { title: "Item" };

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
	const { id } = await params;
	return <ItemDetail id={id} />;
}
