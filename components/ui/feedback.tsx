import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return typeof error === "string" ? error : "Something went wrong";
}

export function ErrorText({
	error,
	className,
}: {
	error: unknown;
	className?: string;
}) {
	if (!error) {
		return null;
	}
	return (
		<p
			role="alert"
			className={cn(
				"rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger",
				className,
			)}
		>
			{errorMessage(error)}
		</p>
	);
}

export function Spinner({ className }: { className?: string }) {
	return (
		<LoaderCircle
			aria-hidden
			className={cn("size-5 animate-spin text-faint", className)}
		/>
	);
}

export function Loading({ label = "Loading…" }: { label?: string }) {
	return (
		<div
			role="status"
			className="flex items-center justify-center gap-2 py-16 text-sm text-muted"
		>
			<Spinner />
			{label}
		</div>
	);
}

export function EmptyState({
	icon,
	title,
	children,
	action,
	className,
}: {
	icon?: ReactNode;
	title: ReactNode;
	children?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-14 text-center",
				className,
			)}
		>
			{icon ? (
				<div className="flex size-12 items-center justify-center rounded-full bg-sunken text-muted [&_svg]:size-6">
					{icon}
				</div>
			) : null}
			<p className="font-medium">{title}</p>
			{children ? (
				<div className="max-w-sm text-sm text-muted">{children}</div>
			) : null}
			{action}
		</div>
	);
}

export function Badge({
	children,
	tone = "neutral",
	className,
}: {
	children: ReactNode;
	tone?: "neutral" | "accent" | "danger" | "success" | "warning";
	className?: string;
}) {
	const tones = {
		neutral: "bg-sunken text-muted",
		accent: "bg-accent-soft text-accent",
		danger: "bg-danger-soft text-danger",
		success: "bg-success/15 text-success",
		warning: "bg-warning/15 text-warning",
	};
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
				tones[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
