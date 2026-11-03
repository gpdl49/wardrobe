"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { isApiError } from "@/lib/client/api";

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Data changes only through this app; a short stale time keeps
				// back/forward navigation instant without serving stale lists.
				staleTime: 30_000,
				gcTime: 10 * 60_000,
				refetchOnWindowFocus: true,
				// 4xx answers will not change on retry.
				retry: (failureCount, error) =>
					!(isApiError(error) && error.status < 500) && failureCount < 2,
			},
		},
	});
}

export function Providers({ children }: { children: ReactNode }) {
	const [client] = useState(makeQueryClient);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
