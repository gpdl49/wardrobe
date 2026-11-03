"use client";

import { decode } from "blurhash";
import { ImageOff, Shirt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PhotoDto } from "@/lib/api/types";
import { cn } from "./ui/cn";

/** Paints a blurhash onto a tiny canvas that CSS stretches to fill its box. */
export function Blurhash({
	hash,
	className,
}: {
	hash: string;
	className?: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext?.("2d");
		if (!canvas || !ctx) {
			return;
		}
		try {
			const pixels = decode(hash, 32, 32);
			const image = ctx.createImageData(32, 32);
			image.data.set(pixels);
			ctx.putImageData(image, 0, 0);
		} catch {
			// An invalid hash just leaves the neutral background.
		}
	}, [hash]);
	return (
		<canvas
			ref={ref}
			width={32}
			height={32}
			aria-hidden
			className={cn("absolute inset-0 size-full", className)}
		/>
	);
}

/**
 * A photo variant over its blurhash; the image fades in when loaded. Photos
 * that are still processing (or have failed) show the placeholder only.
 */
export function Photo({
	photo,
	variant,
	alt,
	className,
	imgClassName,
	fit = "cover",
	priority = false,
}: {
	photo: PhotoDto | null;
	variant: "thumb" | "display";
	alt: string;
	className?: string;
	imgClassName?: string;
	fit?: "cover" | "contain";
	priority?: boolean;
}) {
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);
	const ready = photo?.status === "ready";
	return (
		<div
			className={cn("relative overflow-hidden bg-sunken", className)}
			data-photo-status={photo?.status ?? "none"}
		>
			{photo?.blurhash ? <Blurhash hash={photo.blurhash} /> : null}
			{ready && !failed ? (
				// biome-ignore lint/performance/noImgElement: variants are 302 redirects to presigned S3 URLs, which next/image cannot optimise or cache.
				<img
					src={photo.urls[variant]}
					alt={alt}
					loading={priority ? "eager" : "lazy"}
					decoding="async"
					draggable={false}
					onLoad={() => setLoaded(true)}
					onError={() => setFailed(true)}
					className={cn(
						"absolute inset-0 size-full transition-opacity duration-300",
						fit === "cover" ? "object-cover" : "object-contain",
						loaded ? "opacity-100" : "opacity-0",
						imgClassName,
					)}
				/>
			) : null}
			{!photo?.blurhash && (!ready || failed) ? (
				<div className="absolute inset-0 flex items-center justify-center text-faint">
					{failed || photo?.status === "failed" ? (
						<ImageOff aria-hidden className="size-1/4 max-w-10" />
					) : (
						<Shirt aria-hidden className="size-1/3 max-w-12" />
					)}
				</div>
			) : null}
		</div>
	);
}
