"use client";

import { ChevronLeft, ChevronRight, Shirt, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Photo } from "@/components/photo";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { PhotoDto } from "@/lib/api/types";

const KIND_LABELS: Record<PhotoDto["kind"], string> = {
	main: "Photo",
	label: "Label",
	detail: "Detail",
	outfit: "Outfit",
};

/**
 * Swipeable photo strip (CSS scroll snap, so touch swiping is native and
 * smooth), arrows and thumbnails with a mouse.
 */
export function PhotoGallery({
	photos,
	coverPhotoId,
	alt,
	onSetCover,
	onRemoveBackground,
	requestingBackgroundFor,
}: {
	photos: PhotoDto[];
	coverPhotoId?: string | null;
	alt: string;
	onSetCover?: (photoId: string) => void;
	onRemoveBackground?: (photoId: string) => void;
	requestingBackgroundFor?: string;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const [index, setIndex] = useState(0);

	useEffect(() => {
		const el = scroller.current;
		if (!el) {
			return;
		}
		const onScroll = () => {
			const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
			setIndex(Math.min(Math.max(i, 0), photos.length - 1));
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, [photos.length]);

	const go = useCallback((i: number) => {
		const el = scroller.current;
		el?.scrollTo?.({ left: i * el.clientWidth, behavior: "smooth" });
		setIndex(i);
	}, []);

	if (photos.length === 0) {
		return (
			<div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-sm text-muted">
				<Shirt aria-hidden className="size-10 text-faint" />
				No photos yet
			</div>
		);
	}

	const current = photos[index];
	const canRemove =
		onRemoveBackground &&
		current?.access !== "view" &&
		current?.kind === "main" &&
		current.status === "ready";
	return (
		<div className="flex flex-col gap-2">
			<section
				aria-roledescription="carousel"
				aria-label="Photos"
				className="group relative overflow-hidden rounded-card bg-sunken"
			>
				<div
					ref={scroller}
					className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none"
				>
					{photos.map((photo, i) => (
						<figure
							key={photo.id}
							aria-label={`${i + 1} of ${photos.length}`}
							className="relative w-full shrink-0 snap-center"
						>
							<Photo
								photo={photo}
								variant="display"
								alt={`${alt} — ${KIND_LABELS[photo.kind].toLowerCase()} ${i + 1}`}
								fit="contain"
								priority={i === 0}
								className="size-full"
							/>
							{photo.status !== "ready" ? (
								<span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
									{photo.status === "failed"
										? "Processing failed"
										: "Processing…"}
								</span>
							) : null}
						</figure>
					))}
				</div>
				{photos.length > 1 ? (
					<>
						<Button
							variant="secondary"
							size="icon"
							aria-label="Previous photo"
							disabled={index === 0}
							onClick={() => go(index - 1)}
							className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full opacity-0 shadow-md transition group-hover:opacity-100 pointer-fine:flex"
						>
							<ChevronLeft />
						</Button>
						<Button
							variant="secondary"
							size="icon"
							aria-label="Next photo"
							disabled={index === photos.length - 1}
							onClick={() => go(index + 1)}
							className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full opacity-0 shadow-md transition group-hover:opacity-100 pointer-fine:flex"
						>
							<ChevronRight />
						</Button>
						<div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
							{photos.map((p, i) => (
								<span
									key={p.id}
									className={cn(
										"size-1.5 rounded-full bg-white/60 shadow transition",
										i === index && "w-4 bg-white",
									)}
								/>
							))}
						</div>
					</>
				) : null}
				{current && onSetCover && photos.length > 1 ? (
					<Button
						size="sm"
						variant="secondary"
						disabled={current.id === coverPhotoId}
						onClick={() => onSetCover(current.id)}
						className="absolute top-2 right-2 rounded-full bg-surface/90 shadow-md backdrop-blur"
					>
						<Star
							className={
								current.id === coverPhotoId ? "fill-current" : undefined
							}
						/>
						{current.id === coverPhotoId ? "Cover" : "Make cover"}
					</Button>
				) : null}
			</section>
			{canRemove && current ? (
				<div className="flex items-center gap-3 text-sm">
					{current.backgroundStatus === "ready" ? (
						<a className="text-muted underline" href={current.urls.original}>
							View original
						</a>
					) : current.backgroundStatus === "skipped" ? (
						<span role="status" className="text-muted">
							Couldn’t isolate the garment
						</span>
					) : (
						<Button
							variant="secondary"
							size="sm"
							disabled={
								current.backgroundStatus === "queued" ||
								requestingBackgroundFor === current.id
							}
							onClick={() => onRemoveBackground(current.id)}
						>
							{current.backgroundStatus === "queued" ||
							requestingBackgroundFor === current.id
								? "Removing background…"
								: current.backgroundStatus === "failed"
									? "Retry background removal"
									: "Remove background"}
						</Button>
					)}
				</div>
			) : null}
			{photos.length > 1 ? (
				<div className="no-scrollbar flex gap-2 overflow-x-auto">
					{photos.map((photo, i) => (
						<button
							key={photo.id}
							type="button"
							aria-label={`Show photo ${i + 1}`}
							aria-current={i === index}
							onClick={() => go(i)}
							className={cn(
								"shrink-0 overflow-hidden rounded-lg border-2 transition",
								i === index ? "border-accent" : "border-transparent opacity-70",
							)}
						>
							<Photo photo={photo} variant="thumb" alt="" className="size-14" />
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
