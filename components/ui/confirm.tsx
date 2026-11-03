"use client";

import { AlertDialog as A } from "radix-ui";
import { type ReactNode, useState } from "react";
import { Button } from "./button";
import { ErrorText } from "./feedback";

/**
 * Confirmation for destructive actions. `onConfirm` may throw; the message is
 * shown in the dialog and it stays open.
 */
export function ConfirmDialog({
	trigger,
	title,
	description,
	confirmLabel = "Delete",
	onConfirm,
}: {
	trigger: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	confirmLabel?: string;
	onConfirm: () => Promise<unknown> | unknown;
}) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	return (
		<A.Root
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setError(null);
			}}
		>
			<A.Trigger asChild>{trigger}</A.Trigger>
			<A.Portal>
				<A.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
				<A.Content className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-2xl border border-line bg-raised p-5 text-fg shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(26rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2">
					<A.Title className="text-lg font-semibold">{title}</A.Title>
					<A.Description className="mt-2 text-sm text-muted">
						{description ?? "This cannot be undone."}
					</A.Description>
					<ErrorText error={error} className="mt-3" />
					<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<A.Cancel asChild>
							<Button>Cancel</Button>
						</A.Cancel>
						<Button
							variant="danger"
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								setError(null);
								try {
									await onConfirm();
									setOpen(false);
								} catch (err) {
									setError(err);
								} finally {
									setBusy(false);
								}
							}}
						>
							{busy ? "Working…" : confirmLabel}
						</Button>
					</div>
				</A.Content>
			</A.Portal>
		</A.Root>
	);
}
