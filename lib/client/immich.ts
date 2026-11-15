"use client";

import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ImmichAssetListDto, ImmichStatusDto } from "@/lib/api/types";
import { api } from "./api";

export const immichKeys = {
	all: ["immich"] as const,
	status: ["immich", "status"] as const,
	assets: (q: string) => ["immich", "assets", q] as const,
};

export const immich = {
	status: (signal?: AbortSignal) =>
		api.request<ImmichStatusDto>("GET", "/immich", { signal }),
	connect: (apiKey: string) =>
		api.request<ImmichStatusDto>("PUT", "/immich", { body: { apiKey } }),
	disconnect: () => api.request<void>("DELETE", "/immich"),
	assets: (q: string, cursor: string | null, signal?: AbortSignal) =>
		api.request<ImmichAssetListDto>("GET", "/immich/assets", {
			query: { q, cursor },
			signal,
		}),
};

export function useImmichStatus(enabled = true) {
	return useQuery({
		queryKey: immichKeys.status,
		queryFn: ({ signal }) => immich.status(signal),
		enabled,
	});
}

export function useImmichAssets(q: string, enabled = true) {
	return useInfiniteQuery({
		queryKey: immichKeys.assets(q),
		queryFn: ({ pageParam, signal }) => immich.assets(q, pageParam, signal),
		initialPageParam: null as string | null,
		getNextPageParam: (page) => page.nextCursor,
		enabled,
	});
}

export function useConnectImmich() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: immich.connect,
		onSuccess: () => {
			client.removeQueries({ queryKey: ["immich", "assets"] });
			return client.invalidateQueries({ queryKey: immichKeys.status });
		},
	});
}

export function useDisconnectImmich() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: immich.disconnect,
		onSuccess: () => {
			client.removeQueries({ queryKey: ["immich", "assets"] });
			return client.invalidateQueries({ queryKey: immichKeys.status });
		},
	});
}
