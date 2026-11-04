"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CaptureLoop, Preview } from "@/components/pack/capture-loop";
import { LocationPicker } from "@/components/pack/location-picker";
import { errorMessage } from "@/components/ui/feedback";
import type { LocationDto, LocationRef } from "@/lib/api/types";
import {
	type ActiveSession,
	clearActiveSession,
	loadActiveSession,
	saveActiveSession,
} from "@/lib/client/active-session";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/current-user";
import { useQueueSnapshot, useUploadQueue } from "@/lib/client/upload";

type Phase =
	| { name: "loading" }
	| { name: "choose"; error?: string }
	| {
			name: "starting";
			location: LocationRef;
			/** Idempotency-Key of this start: "Try again" sends it again. */
			key: string;
			error?: string;
	  }
	| { name: "capture"; active: ActiveSession }
	| { name: "summary"; active: ActiveSession; endError?: string };

type Props = {
	/** From /pack?location=<id> (e.g. /l/<ownerId>/<code>?then=pack). */
	initialLocationId?: string;
	/** From /pack?code=<code>: a label that is not set up yet. */
	initialCode?: string;
};

const ref = ({ id, kind, code, name }: LocationRef): LocationRef => ({
	id,
	kind,
	code,
	name,
});

/** /pack: choose a location → session → capture loop → summary. */
export function PackFlow(props: Props) {
	const me = useCurrentUser();
	if (!me) {
		return <p className="text-neutral-500">Loading…</p>;
	}
	// A different user starts over, with their own session and queue.
	return <PackFlowFor key={me.id} userId={me.id} {...props} />;
}

function PackFlowFor({
	userId,
	initialLocationId,
	initialCode,
}: Props & { userId: string }) {
	const [phase, setPhase] = useState<Phase>({ name: "loading" });
	const router = useRouter();

	/**
	 * Starts a session in the location. One Idempotency-Key per choice of
	 * location, reused by "Try again": if a lost response hid a session the
	 * server did start, the retry gets that session back instead of a second.
	 */
	const start = useCallback(
		async (location: LocationRef, key: string = crypto.randomUUID()) => {
			setPhase({ name: "starting", location, key });
			try {
				const session = await api.sessions.start("pack", location.id, {
					idempotencyKey: key,
				});
				const active = { session, location: ref(location) };
				saveActiveSession(userId, "pack", active);
				setPhase({ name: "capture", active });
			} catch (err) {
				setPhase({ name: "starting", location, key, error: errorMessage(err) });
			}
		},
		[userId],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: decide the first phase once
	useEffect(() => {
		const active = loadActiveSession(userId, "pack");
		if (!initialLocationId) {
			setPhase(active ? { name: "capture", active } : { name: "choose" });
			return;
		}
		if (active?.location.id === initialLocationId) {
			setPhase({ name: "capture", active });
			return;
		}
		api.locations
			.get(initialLocationId)
			.then(async (location) => {
				if (location.access === "view") {
					setPhase({
						name: "choose",
						error: `You have view access to ${location.code}.`,
					});
					return;
				}
				if (active) {
					// Scanned a different bag: close the old session first.
					await api.sessions.end(active.session.id).catch(() => undefined);
					clearActiveSession(userId, "pack");
				}
				await start(location);
			})
			.catch((err) => setPhase({ name: "choose", error: errorMessage(err) }));
	}, []);

	const end = async (active: ActiveSession) => {
		clearActiveSession(userId, "pack");
		try {
			await api.sessions.end(active.session.id);
			setPhase({ name: "summary", active });
		} catch (err) {
			setPhase({ name: "summary", active, endError: errorMessage(err) });
		}
	};

	switch (phase.name) {
		case "loading":
			return <p className="text-neutral-500">Loading…</p>;
		case "choose":
			return (
				<div className="flex flex-col gap-4">
					<p className="text-neutral-600 dark:text-neutral-300">
						Which bag or suitcase are you packing?
					</p>
					{phase.error && (
						<p role="alert" className="text-sm text-red-600">
							{phase.error}
						</p>
					)}
					<LocationPicker
						allowCreate
						preferKinds={["bag", "suitcase"]}
						initialCode={initialCode}
						onChoose={(location: LocationDto) => {
							if (initialLocationId || initialCode) router.replace("/pack");
							void start(location);
						}}
					/>
				</div>
			);
		case "starting":
			return (
				<div className="flex flex-col gap-3">
					<p>
						Starting to pack{" "}
						<strong className="font-mono">{phase.location.code}</strong>…
					</p>
					{phase.error && (
						<>
							<p role="alert" className="text-sm text-red-600">
								{phase.error}
							</p>
							<div className="flex gap-3">
								<button
									type="button"
									onClick={() => void start(phase.location, phase.key)}
									className="rounded-lg bg-brand px-4 py-2 font-medium text-white"
								>
									Try again
								</button>
								<button
									type="button"
									onClick={() => setPhase({ name: "choose" })}
									className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
								>
									Pick another
								</button>
							</div>
						</>
					)}
				</div>
			);
		case "capture":
			return (
				<CaptureLoop
					session={phase.active.session}
					location={phase.active.location}
					onEnd={() => void end(phase.active)}
				/>
			);
		case "summary":
			return (
				<Summary
					active={phase.active}
					endError={phase.endError}
					onNext={() => setPhase({ name: "choose" })}
				/>
			);
	}
}

function Summary({
	active,
	endError,
	onNext,
}: {
	active: ActiveSession;
	endError?: string;
	onNext: () => void;
}) {
	const queue = useUploadQueue();
	const { jobs } = useQueueSnapshot(queue);
	const mine = jobs.filter((job) => job.sessionId === active.session.id);
	const items = mine.filter((job) => job.createItem);
	const labels = mine.length - items.length;
	const pending = mine.filter(
		(job) => job.status !== "done" && job.status !== "failed",
	);
	const failed = mine.filter((job) => job.status === "failed");
	const minutes = Math.max(
		1,
		Math.round((Date.now() - Date.parse(active.session.startedAt)) / 60_000),
	);

	const next = () => {
		void queue.forgetFinished(active.session.id);
		onNext();
	};

	return (
		<div className="flex flex-col gap-4">
			<h2 className="text-xl font-semibold">
				<span className="font-mono">{active.location.code}</span> packed
			</h2>
			<p>
				{items.length} item{items.length === 1 ? "" : "s"}
				{labels > 0 && `, ${labels} label photo${labels === 1 ? "" : "s"}`} in{" "}
				{minutes} min.
			</p>
			{pending.length > 0 && (
				<p className="text-sm text-neutral-600 dark:text-neutral-300">
					{pending.length} upload{pending.length === 1 ? "" : "s"} still in
					progress — keep the app open or come back to it; they resume
					automatically.
				</p>
			)}
			{failed.length > 0 && (
				<div className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
					<span>
						{failed.length} upload{failed.length === 1 ? "" : "s"} failed.
					</span>
					<button
						type="button"
						onClick={() => {
							for (const job of failed) void queue.retry(job.id);
						}}
						className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white"
					>
						Retry all
					</button>
				</div>
			)}
			{endError && (
				<p className="text-sm text-amber-700">
					Could not close the session on the server ({endError}); your items are
					saved.
				</p>
			)}
			<ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
				{items.map((job) => (
					<li
						key={job.id}
						className="aspect-square overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800"
					>
						<Preview blob={job.preview} />
					</li>
				))}
			</ul>
			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					onClick={next}
					className="rounded-xl bg-brand px-5 py-3 font-semibold text-white"
				>
					Pack another
				</button>
				<Link
					href={`/locations/${active.location.id}`}
					className="rounded-xl border border-neutral-300 px-5 py-3 font-medium dark:border-neutral-700"
				>
					View {active.location.code}
				</Link>
			</div>
		</div>
	);
}
