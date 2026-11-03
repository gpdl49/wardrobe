import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BottomNav, MobileMenu, TopNav } from "@/components/nav";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
	title: { default: "Wardrobe", template: "%s · Wardrobe" },
	description: "What's packed where.",
	applicationName: "Wardrobe",
	appleWebApp: { capable: true, title: "Wardrobe", statusBarStyle: "default" },
	robots: { index: false, follow: false },
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#fafafa" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-dvh">
				<header className="print:hidden sticky top-0 z-10 border-b border-neutral-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
					<div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
						<Link href="/" className="font-semibold tracking-tight">
							Wardrobe
						</Link>
						<TopNav />
						<a
							href="/oauth2/sign_out"
							className="hidden text-sm text-neutral-500 hover:underline md:block"
						>
							Sign out
						</a>
						<MobileMenu />
					</div>
				</header>
				<main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">
					<Providers>{children}</Providers>
				</main>
				<BottomNav />
			</body>
		</html>
	);
}
