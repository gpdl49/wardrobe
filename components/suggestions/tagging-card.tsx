"use client";

import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/feedback";
import type { BulkApplyField } from "@/lib/api/types";
import { useBulkTagging } from "@/lib/client/suggestions";

/** Tags are added; the rest only fill fields an item does not have yet. */
const APPLY_FIELDS: BulkApplyField[] = [
	"tags",
	"pattern",
	"material",
	"seasons",
];

export function TaggingCard() {
	const { queue, apply } = useBulkTagging();
	return (
		<section className="rounded-card border border-line bg-surface p-4 space-y-3">
			<h2 className="font-semibold">Suggested tags</h2>
			<p className="text-sm text-muted">
				Analysis runs in the background and reads each item&apos;s photos for
				features such as neckline, collar, sleeve, fit, length and closure.
				Applying adds the suggested tags to your items and fills in pattern,
				material and seasons where an item has none. It never replaces what you
				have entered.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button disabled={queue.isPending} onClick={() => queue.mutate({})}>
					Suggest tags for my wardrobe
				</Button>
				<Button
					variant="secondary"
					disabled={apply.isPending}
					onClick={() => apply.mutate({ fields: APPLY_FIELDS })}
				>
					Apply suggestions
				</Button>
			</div>
			{queue.data && <p role="status">{queue.data.queued} items queued.</p>}
			{apply.data && <p role="status">{apply.data.updated} items updated.</p>}
			<ErrorText error={queue.error || apply.error} />
		</section>
	);
}
