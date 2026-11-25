"use client";

import {
	type QueryClient,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import type { ItemDetailDto, ShareAccess } from "@/lib/api/types";
import {
	api,
	type CreateCategoryInput,
	type CreateLocationInput,
	type CreateShareInput,
	type ItemInput,
	type ItemsQuery,
	type LocationsQuery,
	type MoveItemsInput,
	type SuggestionField,
	type UpdateCategoryInput,
	type UpdateLocationInput,
} from "./api";
import { buildCategoryTree, flattenTree } from "./categories";

/**
 * TanStack Query hooks over lib/client/api.ts. Keys are hierarchical so a
 * mutation can invalidate everything that may show what it changed.
 */
export const queryKeys = {
	me: ["me"] as const,
	locations: (query: LocationsQuery = {}) => ["locations", query] as const,
	location: (id: string) => ["location", id] as const,
	categories: ["categories"] as const,
	tags: (owner?: string) => ["tags", owner ?? null] as const,
	shares: ["shares"] as const,
	sharedWithMe: ["shared-with-me"] as const,
	items: (query: ItemsQuery = {}) => ["items", query] as const,
	item: (id: string) => ["item", id] as const,
};

export const ITEMS_PAGE_SIZE = 48;

export function useMe() {
	return useQuery({
		queryKey: queryKeys.me,
		queryFn: () => api.me(),
	});
}

export function useLocations(query: LocationsQuery = {}) {
	return useQuery({
		queryKey: queryKeys.locations(query),
		queryFn: ({ signal }) => api.locations.list(query, signal),
	});
}

export function useLocation(id: string) {
	return useQuery({
		queryKey: queryKeys.location(id),
		queryFn: ({ signal }) => api.locations.get(id, signal),
	});
}

export function useCategories() {
	const query = useQuery({
		queryKey: queryKeys.categories,
		queryFn: ({ signal }) => api.categories.list(signal),
		staleTime: 5 * 60_000,
	});
	const tree = useMemo(
		() => (query.data ? buildCategoryTree(query.data) : []),
		[query.data],
	);
	const flat = useMemo(() => flattenTree(tree), [tree]);
	return { ...query, tree, flat };
}

export function useTags(owner?: string) {
	return useQuery({
		queryKey: queryKeys.tags(owner),
		queryFn: ({ signal }) => api.tags.list({ owner }, signal),
		staleTime: 60_000,
	});
}

export function useItems(query: ItemsQuery) {
	return useInfiniteQuery({
		queryKey: queryKeys.items(query),
		queryFn: ({ pageParam, signal }) =>
			api.items.list(
				{ ...query, cursor: pageParam ?? undefined, limit: ITEMS_PAGE_SIZE },
				signal,
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
		refetchInterval: ({ state }) =>
			state.data?.pages.some((page) =>
				page.items.some(
					(item) => item.coverPhoto?.backgroundStatus === "queued",
				),
			)
				? 3000
				: false,
	});
}

const isPending = (item: ItemDetailDto) =>
	item.analyses.some((a) => a.status === "queued" || a.status === "running") ||
	item.photos.some(
		(p) =>
			p.status === "pending" ||
			p.status === "processing" ||
			p.backgroundStatus === "queued",
	);

export function useItem(id: string) {
	return useQuery({
		queryKey: queryKeys.item(id),
		queryFn: ({ signal }) => api.items.get(id, signal),
		// Poll while renditions or analyses are still being worked on.
		refetchInterval: (query) =>
			query.state.data && isPending(query.state.data) ? 3000 : false,
	});
}

export function useRemovePhotoBackground(itemId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: api.photos.removeBackground,
		onSuccess: () =>
			client.invalidateQueries({ queryKey: queryKeys.item(itemId) }),
	});
}

/** After anything that changes items: lists, locations (counts) and tags. */
export function invalidateItems(client: QueryClient, itemId?: string) {
	void client.invalidateQueries({ queryKey: ["items"] });
	void client.invalidateQueries({ queryKey: ["locations"] });
	void client.invalidateQueries({ queryKey: ["location"] });
	void client.invalidateQueries({ queryKey: ["tags"] });
	if (itemId) {
		void client.invalidateQueries({ queryKey: queryKeys.item(itemId) });
	}
}

export function useUpdateItem(id: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (input: ItemInput) => api.items.update(id, input),
		onSuccess: () => invalidateItems(client, id),
	});
}

export function useDeleteItem() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.items.delete(id),
		onSuccess: (_data, id) => {
			client.removeQueries({ queryKey: queryKeys.item(id) });
			invalidateItems(client);
		},
	});
}

export function useMoveItems() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (input: MoveItemsInput) => api.items.move(input),
		onSuccess: (_data, input) => {
			invalidateItems(client);
			for (const id of input.itemIds) {
				void client.invalidateQueries({ queryKey: queryKeys.item(id) });
			}
		},
	});
}

export function useApplySuggestion(itemId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({
			analysisId,
			fields,
		}: {
			analysisId: string;
			fields: SuggestionField[];
		}) => api.analyses.apply(itemId, analysisId, fields),
		onSuccess: (item) => {
			client.setQueryData(queryKeys.item(itemId), item);
			invalidateItems(client, itemId);
		},
	});
}

export function useRerunAnalysis(itemId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: () => api.analyses.run(itemId),
		onSuccess: () =>
			client.invalidateQueries({ queryKey: queryKeys.item(itemId) }),
	});
}

export function useSaveLocation() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			input,
		}:
			| { id?: undefined; input: CreateLocationInput }
			| { id: string; input: UpdateLocationInput }) =>
			id
				? api.locations.update(id, input)
				: api.locations.create(input as CreateLocationInput),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: ["locations"] });
			void client.invalidateQueries({ queryKey: ["location"] });
			// Items embed a location reference (code, name).
			void client.invalidateQueries({ queryKey: ["items"] });
			void client.invalidateQueries({ queryKey: ["item"] });
		},
	});
}

export function useDeleteLocation() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.locations.delete(id),
		onSuccess: (_data, id) => {
			client.removeQueries({ queryKey: queryKeys.location(id) });
			void client.invalidateQueries({ queryKey: ["locations"] });
			void client.invalidateQueries({ queryKey: ["location"] });
		},
	});
}

export function useCategoryMutations() {
	const client = useQueryClient();
	const onSuccess = () => {
		void client.invalidateQueries({ queryKey: queryKeys.categories });
		void client.invalidateQueries({ queryKey: ["items"] });
		void client.invalidateQueries({ queryKey: ["item"] });
	};
	return {
		create: useMutation({
			mutationFn: (input: CreateCategoryInput) => api.categories.create(input),
			onSuccess,
		}),
		update: useMutation({
			mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
				api.categories.update(id, input),
			onSuccess,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.categories.delete(id),
			onSuccess,
		}),
	};
}

export function useShares() {
	return useQuery({
		queryKey: queryKeys.shares,
		queryFn: ({ signal }) => api.shares.list(signal),
	});
}

export function useSharedWithMe() {
	return useQuery({
		queryKey: queryKeys.sharedWithMe,
		queryFn: ({ signal }) => api.shares.sharedWithMe(signal),
	});
}

export function useShareMutations() {
	const client = useQueryClient();
	const onSuccess = () =>
		client.invalidateQueries({ queryKey: queryKeys.shares });
	return {
		create: useMutation({
			mutationFn: (input: CreateShareInput) => api.shares.create(input),
			onSuccess,
		}),
		update: useMutation({
			mutationFn: ({ id, access }: { id: string; access: ShareAccess }) =>
				api.shares.update(id, access),
			onSuccess,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.shares.delete(id),
			onSuccess,
		}),
	};
}
