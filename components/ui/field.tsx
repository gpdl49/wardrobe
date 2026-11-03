import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Form controls. 16 px text on touch screens so iOS Safari does not zoom in on
 * focus; 44 px tall there, denser with a mouse.
 */
export const controlClass =
	"w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-base text-fg placeholder:text-faint shadow-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60 pointer-fine:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
	return (
		<input
			className={cn(controlClass, "h-11 pointer-fine:h-9", className)}
			{...props}
		/>
	);
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
	return (
		<textarea
			className={cn(controlClass, "min-h-24 py-2", className)}
			{...props}
		/>
	);
}

export function Select({ className, ...props }: ComponentProps<"select">) {
	return (
		<select
			className={cn(
				controlClass,
				"h-11 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8 pointer-fine:h-9",
				"bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
				className,
			)}
			{...props}
		/>
	);
}

export function Field({
	label,
	htmlFor,
	hint,
	children,
	className,
}: {
	label: ReactNode;
	htmlFor?: string;
	hint?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<label htmlFor={htmlFor} className="text-sm font-medium text-muted">
				{label}
			</label>
			{children}
			{hint ? <p className="text-xs text-faint">{hint}</p> : null}
		</div>
	);
}
