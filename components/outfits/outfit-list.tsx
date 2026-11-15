"use client";
import Link from "next/link";
import { useState } from "react";
import { WardrobeSwitcher } from "@/components/sharing/wardrobe-switcher";
import { Button, buttonClass } from "@/components/ui/button";
import { ErrorText, Loading } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import type { Season } from "@/lib/api/types";
import { useCurrentUser } from "@/lib/client/current-user";
import { useOutfits, useSharedOutfits } from "@/lib/client/outfits";
import { useSharedWithMe, useTags } from "@/lib/client/queries";
import { OutfitGrid } from "./outfit-tile";
export function OutfitList() {
	const [owner, setOwner] = useState("");
	const [q, setQ] = useState("");
	const [tag, setTag] = useState("");
	const [season, setSeason] = useState("");
	const me = useCurrentUser();
	const shares = useSharedWithMe();
	const canCreate =
		!owner ||
		shares.data?.some(
			(s) => s.owner.id === owner && !s.location && s.access === "edit",
		);
	const tags = useTags(owner || undefined);
	const list = useOutfits({
		owner: owner || undefined,
		q,
		tag,
		season: (season || undefined) as Season | undefined,
	});
	const shared = useSharedOutfits();
	const all = list.data?.pages.flatMap((p) => p.outfits) ?? [];
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<h1 className="flex-1 text-2xl font-semibold">Outfits</h1>
				{me?.features.suggestions && (
					<Link className={buttonClass({})} href="/outfits/suggest">
						Suggest
					</Link>
				)}
				{canCreate && (
					<Link
						className={buttonClass({ variant: "primary" })}
						href={`/outfits/new${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`}
					>
						New outfit
					</Link>
				)}
			</div>
			<WardrobeSwitcher
				value={owner}
				onChange={(v) => {
					setOwner(v);
					setTag("");
				}}
			/>
			<input
				aria-label="Search outfits"
				placeholder="Search outfits"
				className="rounded-lg border border-line bg-surface p-2"
				value={q}
				onChange={(e) => setQ(e.target.value)}
			/>
			<div className="flex gap-2">
				<Select
					aria-label="Tag"
					value={tag}
					onChange={(e) => setTag(e.target.value)}
				>
					<option value="">All tags</option>
					{tags.data?.map((t) => (
						<option key={t.name} value={t.name}>
							{t.name}
						</option>
					))}
				</Select>
				<Select
					aria-label="Season"
					value={season}
					onChange={(e) => setSeason(e.target.value)}
				>
					<option value="">All seasons</option>
					{["spring", "summer", "autumn", "winter"].map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</Select>
			</div>
			{list.isPending ? (
				<Loading />
			) : list.error && !list.data ? (
				<ErrorText error={list.error} />
			) : all.length ? (
				<OutfitGrid outfits={all} />
			) : (
				<p className="text-muted">No outfits found.</p>
			)}
			{list.hasNextPage && (
				<Button
					onClick={() => void list.fetchNextPage()}
					disabled={list.isFetchingNextPage}
				>
					Load more
				</Button>
			)}
			<ErrorText error={list.isFetchNextPageError ? list.error : null} />
			<section className="flex flex-col gap-3">
				<h2 className="text-xl font-semibold">Shared with me</h2>
				{shared.isPending ? (
					<Loading />
				) : shared.error ? (
					<ErrorText error={shared.error} />
				) : shared.data?.length ? (
					<OutfitGrid outfits={shared.data} />
				) : (
					<p className="text-muted">No outfits shared with you.</p>
				)}
			</section>
		</div>
	);
}
