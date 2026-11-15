"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorText, Loading } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { useImmichAssets, useImmichStatus } from "@/lib/client/immich";
import { useMe } from "@/lib/client/queries";

export type ImmichPickerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (assetIds: string[]) => void | Promise<void>;
};

export function ImmichPicker({
	open,
	onOpenChange,
	onPick,
}: ImmichPickerProps) {
	const [search, setSearch] = useState("");
	const [q, setQ] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const sentinel = useRef<HTMLDivElement>(null);
	const me = useMe();
	const status = useImmichStatus(open && !!me.data?.features.immich);
	const assets = useImmichAssets(
		q,
		open && !!me.data?.features.immich && !!status.data?.connected,
	);
	useEffect(() => {
		const timer = setTimeout(() => setQ(search.trim()), 300);
		return () => clearTimeout(timer);
	}, [search]);
	useEffect(() => {
		if (!open) {
			setSearch("");
			setQ("");
			setSelected([]);
		} else {
			setError(null);
		}
	}, [open]);
	useEffect(() => {
		const node = sentinel.current;
		if (
			!node ||
			!assets.hasNextPage ||
			assets.isFetchingNextPage ||
			typeof IntersectionObserver === "undefined"
		)
			return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting))
				void assets.fetchNextPage();
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [assets.hasNextPage, assets.isFetchingNextPage, assets.fetchNextPage]);
	async function confirm() {
		setBusy(true);
		setError(null);
		try {
			await onPick(selected);
		} catch (err) {
			setError(err);
		} finally {
			setBusy(false);
			onOpenChange(false);
		}
	}
	return (
		<>
			{!open ? <ErrorText error={error} /> : null}
			<Dialog
				open={open}
				onOpenChange={onOpenChange}
				title="Choose from Immich"
				className="top-0 max-h-none rounded-none sm:top-1/2 sm:max-h-[85dvh] sm:rounded-2xl"
				footer={
					status.data?.connected ? (
						<Button
							variant="primary"
							disabled={!selected.length || busy}
							onClick={confirm}
						>
							{busy ? "Adding…" : `Add ${selected.length} selected`}
						</Button>
					) : undefined
				}
			>
				{me.isPending ? (
					<Loading />
				) : me.isError ? (
					<ErrorText error={me.error} />
				) : !me.data.features.immich ? (
					<p className="text-sm text-muted">
						Immich is not enabled on this server.
					</p>
				) : status.isPending ? (
					<Loading />
				) : status.isError ? (
					<ErrorText error={status.error} />
				) : !status.data.connected ? (
					<p className="text-sm text-muted">
						Connect Immich in{" "}
						<Link href="/settings" className="text-accent underline">
							Settings
						</Link>{" "}
						to choose photos.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						<label htmlFor="immich-search" className="sr-only">
							Search photos
						</label>
						<Input
							id="immich-search"
							type="search"
							placeholder="Search photos"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<ErrorText error={error} />
						<ErrorText error={assets.error} />
						{assets.isPending ? (
							<Loading />
						) : (
							<>
								<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
									{assets.data?.pages
										.flatMap((page) => page.assets)
										.map((asset) => {
											const checked = selected.includes(asset.id);
											return (
												<button
													key={asset.id}
													type="button"
													aria-label={asset.fileName || "Photo"}
													aria-pressed={checked}
													onClick={() =>
														setSelected((old) =>
															checked
																? old.filter((id) => id !== asset.id)
																: old.length < 50
																	? [...old, asset.id]
																	: old,
														)
													}
													className={`relative aspect-square overflow-hidden rounded-lg bg-sunken ${checked ? "ring-2 ring-accent ring-offset-2" : ""}`}
												>
													{/* biome-ignore lint/performance/noImgElement: authenticated proxy image, not suitable for Next image optimization */}
													<img
														src={asset.thumbUrl}
														alt=""
														loading="lazy"
														className="size-full object-cover"
													/>
													{checked ? (
														<span className="absolute right-1 top-1 rounded-full bg-accent px-2 text-accent-fg">
															✓
														</span>
													) : null}
												</button>
											);
										})}
								</div>
								{assets.data?.pages[0]?.assets.length === 0 ? (
									<p className="text-sm text-muted">No photos found.</p>
								) : null}
								<div ref={sentinel} />
								{assets.hasNextPage ? (
									<Button
										disabled={assets.isFetchingNextPage}
										onClick={() => void assets.fetchNextPage()}
									>
										{assets.isFetchingNextPage ? "Loading…" : "Load more"}
									</Button>
								) : null}
							</>
						)}
					</div>
				)}
			</Dialog>
		</>
	);
}
