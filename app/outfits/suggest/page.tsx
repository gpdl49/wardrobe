"use client";

import Link from "next/link";
import { useState } from "react";
import { ItemCard } from "@/components/items/item-tile";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/feedback";
import type { Season, SuggestionRunDto } from "@/lib/api/types";
import { userLabel } from "@/lib/client/access";
import { useItems, useMe, useSharedWithMe } from "@/lib/client/queries";
import {
	useSuggestionMutations,
	useSuggestionRun,
	useSuggestionRuns,
} from "@/lib/client/suggestions";

export default function SuggestPage() {
	const me = useMe();
	const shared = useSharedWithMe();
	const [owner, setOwner] = useState("");
	const [prompt, setPrompt] = useState("");
	const [season, setSeason] = useState("");
	const [count, setCount] = useState(3);
	const [selected, setSelected] = useState<string[]>([]);
	const [runId, setRunId] = useState("");
	const items = useItems({ owner: owner || undefined });
	const runs = useSuggestionRuns(owner || undefined);
	const run = useSuggestionRun(runId);
	const mutations = useSuggestionMutations();
	if (me.data && !me.data.features.suggestions)
		return (
			<main className="p-4">
				<h1>Outfit suggestions</h1>
				<p>Suggestions are switched off.</p>
			</main>
		);
	return (
		<main className="mx-auto max-w-4xl space-y-6 p-4">
			<h1 className="text-2xl font-semibold">Outfit suggestions</h1>
			{shared.data?.some((s) => !s.location && s.access === "edit") && (
				<label>
					Wardrobe{" "}
					<select
						value={owner}
						onChange={(e) => {
							setOwner(e.target.value);
							setSelected([]);
							setRunId("");
						}}
					>
						<option value="">My wardrobe</option>
						{shared.data
							.filter((s) => !s.location && s.access === "edit")
							.map((s) => (
								<option key={s.id} value={s.owner.id}>
									{userLabel(s.owner)}'s wardrobe
								</option>
							))}
					</select>
				</label>
			)}
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					mutations.create.mutate(
						{
							ownerId: owner || undefined,
							prompt: prompt || undefined,
							season: (season || undefined) as Season | undefined,
							count,
							itemIds: selected,
						},
						{ onSuccess: (result) => setRunId(result.id) },
					);
				}}
			>
				<label className="block">
					What are you dressing for?
					<textarea
						className="block w-full rounded border border-line p-2"
						maxLength={500}
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
					/>
				</label>
				<div className="flex flex-wrap gap-2">
					{["A casual weekend", "Dinner out", "A day at work"].map(
						(example) => (
							<Button
								key={example}
								type="button"
								variant="secondary"
								onClick={() => setPrompt(example)}
							>
								{example}
							</Button>
						),
					)}
				</div>
				<label>
					Season{" "}
					<select value={season} onChange={(e) => setSeason(e.target.value)}>
						<option value="">Any</option>
						{["spring", "summer", "autumn", "winter"].map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</label>{" "}
				<label>
					How many outfits{" "}
					<input
						type="number"
						min={1}
						max={6}
						value={count}
						onChange={(e) => setCount(Number(e.target.value))}
					/>
				</label>
				<fieldset>
					<legend>Must-include items (up to 5)</legend>
					<div className="max-h-48 overflow-auto">
						{items.data?.pages
							.flatMap((p) => p.items)
							.map((item) => (
								<label key={item.id} className="block">
									<input
										type="checkbox"
										checked={selected.includes(item.id)}
										disabled={
											!selected.includes(item.id) && selected.length >= 5
										}
										onChange={(e) =>
											setSelected(
												e.target.checked
													? [...selected, item.id]
													: selected.filter((id) => id !== item.id),
											)
										}
									/>{" "}
									{item.name || "Unnamed item"}
								</label>
							))}
					</div>
					{items.hasNextPage && (
						<Button
							type="button"
							variant="secondary"
							onClick={() => items.fetchNextPage()}
						>
							Load more items
						</Button>
					)}
				</fieldset>
				<Button type="submit" disabled={mutations.create.isPending}>
					Suggest outfits
				</Button>
				<ErrorText error={mutations.create.error} />
			</form>
			{run.data && <Run run={run.data} owner={owner} />}
			{run.error && <ErrorText error={run.error} />}
			<section className="space-y-3">
				<h2 className="text-xl font-semibold">Past runs</h2>
				<ErrorText error={runs.error} />
				{runs.data
					?.filter((r) => r.id !== runId)
					.map((r) => (
						<PastRun key={r.id} run={r} owner={owner} />
					))}
			</section>
		</main>
	);
}
function PastRun({ run, owner }: { run: SuggestionRunDto; owner: string }) {
	const pending = run.status === "queued" || run.status === "running";
	return pending ? (
		<PendingPastRun run={run} owner={owner} />
	) : (
		<Run run={run} owner={owner} />
	);
}

function PendingPastRun({
	run,
	owner,
}: {
	run: SuggestionRunDto;
	owner: string;
}) {
	const query = useSuggestionRun(run.id);
	return (
		<>
			<Run run={query.data ?? run} owner={owner} />
			<ErrorText error={query.error} />
		</>
	);
}

function Run({ run, owner }: { run: SuggestionRunDto; owner: string }) {
	const actions = useSuggestionMutations();
	return (
		<article className="space-y-3 rounded-card border border-line bg-surface p-4">
			<p>
				{new Date(run.createdAt).toLocaleString()} · {run.status}
			</p>
			{(run.status === "queued" || run.status === "running") && (
				<p role="status">
					Putting outfits together; this can take several seconds…
				</p>
			)}
			{run.status === "failed" && (
				<p role="alert">{run.error || "The run failed."}</p>
			)}
			{run.suggestions.map((s) => (
				<section key={s.id} className="space-y-3 border-t border-line pt-3">
					<h3 className="font-semibold">{s.name}</h3>
					<p>{s.rationale}</p>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{s.items.map((item) => (
							<ItemCard key={item.id} item={item} />
						))}
					</div>
					{s.feedback === "saved" ? (
						s.outfitId ? (
							<Link href={`/outfits/${s.outfitId}`}>View saved outfit</Link>
						) : (
							<p>Saved</p>
						)
					) : s.feedback === "dismissed" ? (
						<p>Dismissed</p>
					) : (
						<div className="flex gap-2">
							<Button
								disabled={actions.save.isPending || actions.dismiss.isPending}
								onClick={() =>
									actions.save.mutate({
										name: s.name,
										itemIds: s.items.map((i) => i.id),
										ownerId: owner || undefined,
										suggestionId: s.id,
									})
								}
							>
								Save
							</Button>
							<Button
								variant="secondary"
								disabled={actions.save.isPending || actions.dismiss.isPending}
								onClick={() => actions.dismiss.mutate(s.id)}
							>
								Dismiss
							</Button>
						</div>
					)}
				</section>
			))}
			<ErrorText error={actions.save.error || actions.dismiss.error} />
		</article>
	);
}
