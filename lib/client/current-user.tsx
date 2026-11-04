"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import type { MeDto } from "@/lib/api/types";
import { useMe } from "@/lib/client/queries";
import {
	activateUploadQueue,
	getUploadQueue,
	UploadQueueContext,
} from "@/lib/client/upload";

/** Null until /api/me has answered. */
export const CurrentUserContext = createContext<MeDto | null>(null);

export function useCurrentUser(): MeDto | null {
	return useContext(CurrentUserContext);
}

/**
 * Knows who is signed in, and keeps per-user state with them: the upload queue
 * only exists once the user is known, and when the user changes (another
 * account signed in from a different tab) the old queue pauses and nothing
 * cached for the old user is shown to the new one.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
	const client = useQueryClient();
	const me = useMe().data ?? null;
	const userId = me?.id;
	const queue = useMemo(
		() => (userId ? getUploadQueue(userId) : null),
		[userId],
	);
	const previous = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (!userId || !queue) {
			return;
		}
		if (previous.current && previous.current !== userId) {
			void client.resetQueries({
				predicate: (query) => query.queryKey[0] !== "me",
			});
		}
		previous.current = userId;
		return activateUploadQueue(queue);
	}, [client, queue, userId]);

	return (
		<CurrentUserContext.Provider value={me}>
			<UploadQueueContext.Provider value={queue}>
				{children}
			</UploadQueueContext.Provider>
		</CurrentUserContext.Provider>
	);
}
