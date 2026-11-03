import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const variants = {
	primary:
		"bg-accent text-accent-fg shadow-sm hover:brightness-110 active:brightness-95",
	secondary:
		"border border-line bg-surface text-fg shadow-xs hover:bg-sunken active:bg-sunken",
	ghost: "text-fg hover:bg-sunken active:bg-sunken",
	danger:
		"bg-danger text-white shadow-sm hover:brightness-110 active:brightness-95",
	"danger-ghost": "text-danger hover:bg-danger-soft",
} as const;

/**
 * 44 px tall on touch screens (pointer: coarse), denser with a mouse.
 * `icon` buttons are square.
 */
const sizes = {
	md: "min-h-11 px-4 text-[15px] pointer-fine:min-h-9 pointer-fine:px-3 pointer-fine:text-sm",
	sm: "min-h-11 px-3 text-sm pointer-fine:min-h-8 pointer-fine:px-2.5",
	icon: "size-11 pointer-fine:size-9",
} as const;

export type ButtonProps = ComponentProps<"button"> & {
	variant?: keyof typeof variants;
	size?: keyof typeof sizes;
	asChild?: boolean;
};

export function buttonClass({
	variant = "secondary",
	size = "md",
	className,
}: Pick<ButtonProps, "variant" | "size" | "className"> = {}) {
	return cn(
		"inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-lg font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
		variants[variant],
		sizes[size],
		className,
	);
}

export function Button({
	variant,
	size,
	asChild,
	className,
	type = "button",
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			type={asChild ? undefined : type}
			className={buttonClass({ variant, size, className })}
			{...props}
		/>
	);
}
