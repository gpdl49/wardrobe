"use client";

import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	OutfitDetailDto,
	OutfitListDto,
	OutfitPhotoDto,
	OutfitShareDto,
	OutfitSummaryDto,
	PhotoUploadDto,
	Season,
} from "@/lib/api/types";
import { api } from "./api";
import { prepareImage } from "./upload/resize";

export type OutfitQuery = {
	owner?: string;
	q?: string;
	tag?: string;
	season?: Season;
	item?: string;
	cursor?: string;
	limit?: number;
};
export type OutfitInput = {
	name: string;
	notes?: string | null;
	seasons?: Season[];
	tags?: string[];
	itemIds?: string[];
	ownerId?: string;
};
const path = (id: string) => `/outfits/${encodeURIComponent(id)}`;
export const outfitKeys = {
	all: ["outfits"] as const,
	list: (q: OutfitQuery) => ["outfits", q] as const,
	detail: (id: string) => ["outfit", id] as const,
	shared: ["outfits", "shared"] as const,
};
export const outfits = {
	list: (query: OutfitQuery = {}, signal?: AbortSignal) =>
		api.request<OutfitListDto>("GET", "/outfits", {
			query: { ...query },
			signal,
		}),
	shared: () =>
		api.request<OutfitSummaryDto[]>("GET", "/outfits/shared-with-me"),
	get: (id: string) => api.request<OutfitDetailDto>("GET", path(id)),
	create: (body: OutfitInput) =>
		api.request<OutfitDetailDto>("POST", "/outfits", {
			body,
			idempotencyKey: crypto.randomUUID(),
		}),
	update: (id: string, body: OutfitInput) =>
		api.request<OutfitDetailDto>("PATCH", path(id), { body }),
	delete: (id: string) => api.request<void>("DELETE", path(id)),
	share: (id: string, grantee: string) =>
		api.request<OutfitShareDto>("POST", `${path(id)}/shares`, {
			body: { grantee },
		}),
	unshare: (id: string, shareId: string) =>
		api.request<void>(
			"DELETE",
			`${path(id)}/shares/${encodeURIComponent(shareId)}`,
		),
	link: (id: string, assetIds: string[]) =>
		api.request<OutfitPhotoDto[]>("POST", `${path(id)}/immich-assets`, {
			body: { assetIds },
		}),
	removePhoto: (id: string, photo: OutfitPhotoDto) =>
		photo.source === "immich"
			? api.request<void>(
					"DELETE",
					`${path(id)}/immich-assets/${encodeURIComponent(photo.id)}`,
				)
			: api.photos.delete(photo.id),
	upload: async (id: string, file: Blob) => {
		const { upload } = await prepareImage(file);
		const result = await api.request<PhotoUploadDto>("POST", "/photos", {
			body: {
				outfitId: id,
				kind: "outfit",
				contentType: upload.type,
				size: upload.size,
			},
			idempotencyKey: crypto.randomUUID(),
		});
		await api.photos.put(result.uploadUrl, result.uploadHeaders, upload);
		return api.photos.complete(result.photo.id);
	},
};
export function useOutfits(query: OutfitQuery = {}) {
	return useInfiniteQuery({
		queryKey: outfitKeys.list(query),
		queryFn: ({ pageParam, signal }) =>
			outfits.list({ ...query, cursor: pageParam ?? undefined }, signal),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
	});
}
export function useSharedOutfits() {
	return useQuery({ queryKey: outfitKeys.shared, queryFn: outfits.shared });
}
export function useOutfit(id: string) {
	return useQuery({
		queryKey: outfitKeys.detail(id),
		queryFn: () => outfits.get(id),
		refetchInterval: (q) =>
			q.state.data?.photos.some(
				(p) => p.status === "pending" || p.status === "processing",
			)
				? 3000
				: false,
	});
}
export function useOutfitMutation<T>(
	id: string,
	fn: (value: T) => Promise<unknown>,
) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: outfitKeys.all });
			void client.invalidateQueries({ queryKey: outfitKeys.detail(id) });
		},
	});
}
