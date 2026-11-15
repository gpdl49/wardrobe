"use client";
import Link from "next/link";
import { useState } from "react";
import { Photo } from "@/components/photo";
import type { OutfitPhotoDto, OutfitSummaryDto } from "@/lib/api/types";

export function OutfitImage({
	photo,
	alt,
}: {
	photo: OutfitPhotoDto;
	alt: string;
}) {
	const [failed, setFailed] = useState(false);
	return failed || photo.status !== "ready" ? (
		<div className="flex aspect-square items-center justify-center bg-sunken text-sm text-muted">
			Photo unavailable
		</div>
	) : (
		// biome-ignore lint/performance/noImgElement: API photo URLs stream or redirect to image bytes.
		<img
			src={photo.urls.thumb}
			alt={alt}
			onError={() => setFailed(true)}
			className="aspect-square w-full object-cover"
		/>
	);
}
export function OutfitTile({ outfit }: { outfit: OutfitSummaryDto }) {
	return (
		<Link
			href={`/outfits/${outfit.id}`}
			className="block overflow-hidden rounded-card border border-line bg-surface"
		>
			<div className="aspect-square overflow-hidden bg-sunken">
				{outfit.cover ? (
					<OutfitImage photo={outfit.cover} alt="" />
				) : (
					<div className="grid h-full grid-cols-2">
						{outfit.previewItems.map((item) => (
							<Photo
								key={item.id}
								photo={item.coverPhoto}
								variant="thumb"
								alt=""
								className="min-h-0"
							/>
						))}
					</div>
				)}
			</div>
			<div className="p-3">
				<span className="font-medium">{outfit.name}</span>
				<p className="text-sm text-muted">{outfit.itemCount} items</p>
			</div>
		</Link>
	);
}
export function OutfitGrid({ outfits }: { outfits: OutfitSummaryDto[] }) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
			{outfits.map((outfit) => (
				<OutfitTile key={outfit.id} outfit={outfit} />
			))}
		</div>
	);
}
