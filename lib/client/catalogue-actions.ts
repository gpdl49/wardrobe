"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetailDto } from "@/lib/api/types";
import { api, type SuggestionField } from "./api";
import { invalidateItems, queryKeys } from "./queries";

export const catalogueActions = {
	backgrounds: "Remove backgrounds",
	suggestions: "Accept suggested tags and colours",
	analysis: "Re-run analysis",
} as const;

export type CatalogueAction = keyof typeof catalogueActions;

async function acceptSuggestions(item: ItemDetailDto) {
	// The detail API returns analyses newest first, including the tie-break by ID.
	const changes = new Map<string, SuggestionField[]>();
	for (const field of ["tags", "colors"] as const) {
		const analysis = item.analyses.find(
			(a) => a.status === "done" && a.result?.[field]?.length,
		);
		if (!analysis?.result) continue;
		const { tags, colors } = analysis.result;
		const alreadyApplied =
			field === "tags"
				? tags?.every((tag) => item.tags.includes(tag.toLowerCase()))
				: colors?.length === item.colors.length &&
					colors.every((color, index) => {
						const current = item.colors[index];
						return (
							current?.name === color.name &&
							current.hex === color.hex &&
							current.share === color.share
						);
					});
		if (alreadyApplied) continue;
		changes.set(analysis.id, [...(changes.get(analysis.id) ?? []), field]);
	}
	for (const [analysisId, fields] of changes) {
		await api.analyses.apply(item.id, analysisId, fields);
	}
	return changes.size > 0;
}

async function runAction(
	action: CatalogueAction,
	id: string,
): Promise<boolean> {
	const item = await api.items.get(id);
	if (item.access === "view") return false;

	switch (action) {
		case "backgrounds": {
			const photos = item.photos.filter(
				(p) =>
					(p.kind === "main" || p.kind === "back") &&
					p.status === "ready" &&
					p.backgroundStatus !== "queued" &&
					p.backgroundStatus !== "ready",
			);
			// Try every eligible photo even if a request fails.
			let failure: unknown;
			for (const photo of photos) {
				try {
					await api.photos.removeBackground(photo.id);
				} catch (error) {
					failure ??= error;
				}
			}
			if (failure) throw failure;
			return photos.length > 0;
		}
		case "suggestions":
			return acceptSuggestions(item);
		case "analysis":
			if (
				item.analyses.some(
					(a) => a.status === "queued" || a.status === "running",
				) ||
				!item.photos.some(
					(p) =>
						p.status === "ready" && ["main", "back", "label"].includes(p.kind),
				)
			) {
				return false;
			}
			await api.analyses.run(id);
			return true;
	}
}

export function useCatalogueAction() {
	const client = useQueryClient();

	return useMutation({
		mutationFn: async ({
			action,
			ids,
		}: {
			action: CatalogueAction;
			ids: string[];
		}) => {
			let processed = 0;
			let skipped = 0;
			const failed: Array<{ id: string; error: unknown }> = [];
			// Bound requests while still processing several items at once.
			for (let start = 0; start < ids.length; start += 4) {
				const batch = ids.slice(start, start + 4);
				await Promise.all(
					batch.map(async (id) => {
						try {
							if (await runAction(action, id)) processed++;
							else skipped++;
						} catch (error) {
							failed.push({ id, error });
						}
					}),
				);
			}
			return { action, processed, skipped, failed };
		},
		onSuccess: ({ action }, { ids }) => {
			if (action === "suggestions") invalidateItems(client);
			if (action === "backgrounds") {
				void client.invalidateQueries({ queryKey: ["items"] });
			}
			for (const id of ids) {
				void client.invalidateQueries({ queryKey: queryKeys.item(id) });
			}
		},
	});
}
