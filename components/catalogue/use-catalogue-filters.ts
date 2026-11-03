"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	type CatalogueFilters,
	DEFAULT_FILTERS,
	ITEM_FILTER_KEYS,
	parseFilters,
	serializeFilters,
} from "@/lib/client/filters";

/**
 * The catalogue's filters, read from and written to the URL query string.
 * Updates replace the history entry (typing in search should not fill the
 * back stack) and keep the scroll position.
 */
export function useCatalogueFilters() {
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const filters = useMemo(() => parseFilters(params), [params]);

	const setFilters = useCallback(
		(patch: Partial<CatalogueFilters>) => {
			const qs = serializeFilters({ ...filters, ...patch });
			router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		},
		[filters, pathname, router],
	);

	const clearFilters = useCallback(() => {
		const cleared: Partial<CatalogueFilters> = {};
		for (const key of ITEM_FILTER_KEYS) {
			cleared[key] = DEFAULT_FILTERS[key] as never;
		}
		setFilters(cleared);
	}, [setFilters]);

	return { filters, setFilters, clearFilters };
}
