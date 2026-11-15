"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	BulkAnalysesDto,
	BulkApplyField,
	BulkApplyTagsDto,
	OutfitDetailDto,
	OutfitSuggestionDto,
	SuggestionRequest,
	SuggestionRunDto,
} from "@/lib/api/types";
import { api } from "./api";

type BulkInput = { ownerId?: string; itemIds?: string[] };
export const suggestionKeys = {
	runs: (owner?: string) => ["suggestion-runs", owner ?? null] as const,
	run: (id: string) => ["suggestion-run", id] as const,
};
export const suggestionsApi = {
	list: (owner?: string) =>
		api.request<SuggestionRunDto[]>("GET", "/suggestion-runs", {
			query: { owner },
		}),
	get: (id: string) =>
		api.request<SuggestionRunDto>(
			"GET",
			`/suggestion-runs/${encodeURIComponent(id)}`,
		),
	create: (body: SuggestionRequest & { ownerId?: string }) =>
		api.request<SuggestionRunDto>("POST", "/suggestion-runs", {
			body,
			idempotencyKey: crypto.randomUUID(),
		}),
	dismiss: (id: string) =>
		api.request<OutfitSuggestionDto>(
			"POST",
			`/outfit-suggestions/${encodeURIComponent(id)}/dismiss`,
		),
	save: (body: {
		name: string;
		itemIds: string[];
		ownerId?: string;
		suggestionId: string;
	}) =>
		api.request<OutfitDetailDto>("POST", "/outfits", {
			body,
			idempotencyKey: crypto.randomUUID(),
		}),
	queueTags: (body: BulkInput = {}) =>
		api.request<BulkAnalysesDto>("POST", "/items/analyses", { body }),
	applyTags: (body: BulkInput & { fields?: BulkApplyField[] } = {}) =>
		api.request<BulkApplyTagsDto>("POST", "/items/analyses/apply-tags", {
			body,
		}),
};
export function useSuggestionRuns(owner?: string) {
	return useQuery({
		queryKey: suggestionKeys.runs(owner),
		queryFn: () => suggestionsApi.list(owner),
	});
}
export function useSuggestionRun(id: string) {
	return useQuery({
		queryKey: suggestionKeys.run(id),
		queryFn: () => suggestionsApi.get(id),
		enabled: !!id,
		refetchInterval: (q) =>
			q.state.data && ["queued", "running"].includes(q.state.data.status)
				? 3000
				: false,
	});
}
export function useSuggestionMutations() {
	const client = useQueryClient();
	const refresh = () => {
		void client.invalidateQueries({ queryKey: ["suggestion-runs"] });
		void client.invalidateQueries({ queryKey: ["suggestion-run"] });
	};
	return {
		create: useMutation({
			mutationFn: suggestionsApi.create,
			onSuccess: refresh,
		}),
		dismiss: useMutation({
			mutationFn: suggestionsApi.dismiss,
			onSuccess: refresh,
		}),
		save: useMutation({ mutationFn: suggestionsApi.save, onSuccess: refresh }),
	};
}
export function useBulkTagging() {
	const client = useQueryClient();
	return {
		queue: useMutation({ mutationFn: suggestionsApi.queueTags }),
		apply: useMutation({
			mutationFn: suggestionsApi.applyTags,
			onSuccess: () => {
				void client.invalidateQueries({ queryKey: ["items"] });
				void client.invalidateQueries({ queryKey: ["tags"] });
			},
		}),
	};
}
