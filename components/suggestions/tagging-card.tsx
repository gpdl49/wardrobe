"use client";

import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/feedback";
import { useBulkTagging } from "@/lib/client/suggestions";

export function TaggingCard() {
	const { queue, apply } = useBulkTagging();
	return (
		<section className="rounded-card border border-line bg-surface p-4 space-y-3">
			<h2 className="font-semibold">Suggested tags</h2>
			<p className="text-sm text-muted">
				Tagging runs in the background. Applying adds suggested tags from the
				latest completed analysis to your items.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button disabled={queue.isPending} onClick={() => queue.mutate({})}>
					Suggest tags for my wardrobe
				</Button>
				<Button
					variant="secondary"
					disabled={apply.isPending}
					onClick={() => apply.mutate({})}
				>
					Apply suggested tags
				</Button>
			</div>
			{queue.data && <p role="status">{queue.data.queued} items queued.</p>}
			{apply.data && <p role="status">{apply.data.updated} items updated.</p>}
			<ErrorText error={queue.error || apply.error} />
		</section>
	);
}
