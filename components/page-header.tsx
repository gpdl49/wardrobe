import type { ReactNode } from "react";

export function PageHeader({
	title,
	children,
}: {
	title: string;
	children?: ReactNode;
}) {
	return (
		<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
			<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
			{children}
		</div>
	);
}

/** Stand-in body for pages whose feature is not built yet. */
export function Placeholder({ children }: { children: ReactNode }) {
	return (
		<p className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
			{children}
		</p>
	);
}
