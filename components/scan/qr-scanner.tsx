"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseLabel } from "@/lib/client/qr";
import { preloadReader, readQr } from "@/lib/client/zxing";

/** How often a video frame is decoded. */
const SCAN_INTERVAL_MS = 200;
/** Frames are downscaled to this long edge before decoding. */
const FRAME_EDGE = 720;

type Props = {
	/** Called once with the location code of a wardrobe label. */
	onCode: (code: string) => void;
	onClose: () => void;
};

/**
 * Full-screen QR scanner: getUserMedia + zxing-wasm. When the camera stream
 * is unavailable (permission denied, older iOS home-screen apps, no HTTPS) it
 * falls back to photographing the label with the native camera.
 */
export function QrScanner({ onCode, onClose }: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [status, setStatus] = useState<"starting" | "scanning" | "unavailable">(
		"starting",
	);
	const [hint, setHint] = useState<string | null>(null);
	const done = useRef(false);
	const onCodeRef = useRef(onCode);
	onCodeRef.current = onCode;

	const accept = (text: string | null): boolean => {
		if (!text || done.current) return false;
		const code = parseLabel(text, [window.location.host]);
		if (!code) {
			setHint("That QR code is not a wardrobe label.");
			return false;
		}
		done.current = true;
		navigator.vibrate?.(50);
		onCodeRef.current(code);
		return true;
	};
	const acceptRef = useRef(accept);
	acceptRef.current = accept;

	useEffect(() => {
		preloadReader();
		let stream: MediaStream | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d", { willReadFrequently: true });

		const tick = async () => {
			const video = videoRef.current;
			if (cancelled || !video || !ctx) return;
			if (video.readyState >= 2 && video.videoWidth > 0) {
				const scale = Math.min(
					1,
					FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight),
				);
				canvas.width = Math.round(video.videoWidth * scale);
				canvas.height = Math.round(video.videoHeight * scale);
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				try {
					const text = await readQr(
						ctx.getImageData(0, 0, canvas.width, canvas.height),
					);
					if (acceptRef.current(text)) return;
				} catch {
					// Keep scanning; a failed wasm load surfaces via the fallback.
				}
			}
			if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
		};

		(async () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				setStatus("unavailable");
				return;
			}
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						facingMode: { ideal: "environment" },
						width: { ideal: 1280 },
						height: { ideal: 720 },
					},
				});
			} catch {
				if (!cancelled) setStatus("unavailable");
				return;
			}
			if (cancelled) {
				for (const track of stream.getTracks()) track.stop();
				return;
			}
			const video = videoRef.current;
			if (video) {
				video.srcObject = stream;
				await video.play().catch(() => undefined);
			}
			setStatus("scanning");
			void tick();
		})();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			// Releases the camera (and the iOS camera indicator) immediately.
			for (const track of stream?.getTracks() ?? []) track.stop();
			canvas.width = 0;
			canvas.height = 0;
		};
	}, []);

	const onPhoto = async (file: File | undefined) => {
		if (!file) return;
		setHint("Reading the label…");
		try {
			const text = await readQr(file);
			if (!text) {
				setHint("No QR code found. Try again closer, with the label flat.");
				return;
			}
			acceptRef.current(text);
		} catch {
			setHint("Could not read the photo.");
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Scan a label"
			className="fixed inset-0 z-50 flex flex-col bg-black text-white"
		>
			<div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
				<span className="font-medium">Scan a label</span>
				<button
					type="button"
					onClick={onClose}
					className="rounded-full p-2 hover:bg-white/10"
					aria-label="Close scanner"
				>
					<X className="size-6" aria-hidden />
				</button>
			</div>
			<div className="relative flex flex-1 items-center justify-center overflow-hidden">
				{/* playsInline + muted are required for inline autoplay on iOS. */}
				<video
					ref={videoRef}
					playsInline
					muted
					autoPlay
					className="absolute inset-0 size-full object-cover"
				/>
				{status === "scanning" && (
					<div className="pointer-events-none relative size-64 rounded-2xl border-4 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
				)}
				{status === "starting" && <p className="relative">Starting camera…</p>}
				{status === "unavailable" && (
					<p className="relative max-w-xs px-6 text-center text-sm">
						The live camera is not available here. Take a photo of the label
						instead.
					</p>
				)}
			</div>
			<div className="flex flex-col items-center gap-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
				{hint && (
					<p role="status" className="text-center text-sm text-white/90">
						{hint}
					</p>
				)}
				<label className="flex cursor-pointer items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-medium hover:bg-white/25">
					<Camera className="size-5" aria-hidden />
					Photograph the label
					<input
						type="file"
						accept="image/*"
						capture="environment"
						className="sr-only"
						onChange={(e) => {
							void onPhoto(e.target.files?.[0]);
							e.target.value = "";
						}}
					/>
				</label>
			</div>
		</div>
	);
}
