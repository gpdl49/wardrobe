import type { UploadQueue } from "@/lib/client/upload/queue";

/**
 * iOS Safari has no Background Sync and suspends pages in the background, so
 * the queue resumes whenever the page could make progress again: when it is
 * shown (including from the back/forward cache), becomes visible, regains
 * focus or the network comes back. Returns a cleanup function.
 */
export function attachLifecycle(queue: UploadQueue, target: Window = window) {
	const kick = () => {
		if (target.document.visibilityState !== "hidden") {
			queue.kick();
		}
	};
	const events = ["online", "pageshow", "focus"] as const;
	for (const event of events) target.addEventListener(event, kick);
	target.document.addEventListener("visibilitychange", kick);
	void queue.start();
	return () => {
		for (const event of events) target.removeEventListener(event, kick);
		target.document.removeEventListener("visibilitychange", kick);
	};
}
