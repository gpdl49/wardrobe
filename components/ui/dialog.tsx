"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

/**
 * Modal dialog: a bottom sheet on phones (reachable one-handed), a centred
 * card from `sm` up.
 */
export function Dialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	footer,
	trigger,
	className,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
	trigger?: ReactNode;
	className?: string;
}) {
	return (
		<D.Root open={open} onOpenChange={onOpenChange}>
			{trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
			<D.Portal>
				<D.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
				<D.Content
					className={cn(
						"fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border border-line bg-raised pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl outline-none",
						"sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0",
						className,
					)}
				>
					<div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
					<div className="flex items-start justify-between gap-4 px-5 pt-3 sm:pt-5">
						<div>
							<D.Title className="text-lg font-semibold">{title}</D.Title>
							{description ? (
								<D.Description className="mt-1 text-sm text-muted">
									{description}
								</D.Description>
							) : (
								<D.Description className="sr-only">{title}</D.Description>
							)}
						</div>
						<D.Close asChild>
							<Button variant="ghost" size="icon" aria-label="Close">
								<X />
							</Button>
						</D.Close>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
						{children}
					</div>
					{footer ? (
						<div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end">
							{footer}
						</div>
					) : null}
				</D.Content>
			</D.Portal>
		</D.Root>
	);
}

export const DialogClose = D.Close;
