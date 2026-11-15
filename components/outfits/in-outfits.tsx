"use client";
import { Button } from "@/components/ui/button";
import { ErrorText, Loading } from "@/components/ui/feedback";
import type { ItemSummaryDto } from "@/lib/api/types";
import { useOutfits } from "@/lib/client/outfits";
import { OutfitGrid } from "./outfit-tile";
export function InOutfits({ item }: { item: ItemSummaryDto }) {
	const query = useOutfits({ owner: item.ownerId, item: item.id });
	const all = query.data?.pages.flatMap((p) => p.outfits) ?? [];
	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-xl font-semibold">In outfits</h2>
			{query.isPending ? (
				<Loading />
			) : query.error && !query.data ? (
				<ErrorText error={query.error} />
			) : all.length ? (
				<OutfitGrid outfits={all} />
			) : (
				<p className="text-muted">Not in any outfits yet.</p>
			)}
			{query.hasNextPage && (
				<Button onClick={() => void query.fetchNextPage()}>Load more</Button>
			)}
		</section>
	);
}
