"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_ITEMS, navItemsFor } from "@/components/nav-items";
import { useCurrentUser } from "@/lib/client/current-user";

/** Top navigation on wider screens. */
export function TopNav() {
	const pathname = usePathname();
	const me = useCurrentUser();
	return (
		<nav aria-label="Main" className="hidden gap-1 md:flex">
			{navItemsFor(me?.isAdmin ?? false).map(({ href, label }) => (
				<Link
					key={href}
					href={href}
					aria-current={isActive(pathname, href) ? "page" : undefined}
					className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 aria-[current=page]:bg-neutral-200 aria-[current=page]:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:aria-[current=page]:bg-neutral-800 dark:aria-[current=page]:text-white"
				>
					{label}
				</Link>
			))}
		</nav>
	);
}

/** Bottom tab bar on phones; the remaining pages are in the header menu. */
export function BottomNav() {
	const pathname = usePathname();
	return (
		<nav
			aria-label="Main"
			className="print:hidden fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-900/95"
		>
			{NAV_ITEMS.filter((item) => item.primary).map(
				({ href, label, icon: Icon }) => (
					<Link
						key={href}
						href={href}
						aria-current={isActive(pathname, href) ? "page" : undefined}
						className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-neutral-500 aria-[current=page]:text-brand dark:text-neutral-400 dark:aria-[current=page]:text-white"
					>
						<Icon aria-hidden className="size-5" />
						{label}
					</Link>
				),
			)}
		</nav>
	);
}

/** Secondary pages on phones. */
export function MobileMenu() {
	const me = useCurrentUser();
	return (
		<details className="relative md:hidden">
			<summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium">
				More
			</summary>
			<div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
				{navItemsFor(me?.isAdmin ?? false)
					.filter((item) => !item.primary)
					.map(({ href, label }) => (
						<Link
							key={href}
							href={href}
							className="rounded px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
						>
							{label}
						</Link>
					))}
				<a
					href="/oauth2/sign_out"
					className="rounded px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
				>
					Sign out
				</a>
			</div>
		</details>
	);
}
