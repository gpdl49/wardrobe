import {
	Archive,
	FolderTree,
	type LucideIcon,
	MapPin,
	PackageOpen,
	QrCode,
	Settings,
	Shirt,
	Sparkles,
	Users,
} from "lucide-react";

export type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	/** Shown in the mobile bottom bar (space for about five). */
	primary: boolean;
	/** Only for ADMIN_GROUP. */
	adminOnly?: boolean;
};

/** Pages from docs/wardrobe.md "Pages". */
export const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: "Catalogue", icon: Shirt, primary: true },
	{ href: "/outfits", label: "Outfits", icon: Sparkles, primary: true },
	{ href: "/locations", label: "Locations", icon: MapPin, primary: true },
	{ href: "/pack", label: "Pack", icon: Archive, primary: true },
	{ href: "/unpack", label: "Unpack", icon: PackageOpen, primary: true },
	{ href: "/sharing", label: "Sharing", icon: Users, primary: false },
	{ href: "/admin/labels", label: "Labels", icon: QrCode, primary: false },
	{ href: "/settings", label: "Settings", icon: Settings, primary: false },
	{
		href: "/admin/categories",
		label: "Categories",
		icon: FolderTree,
		primary: false,
		adminOnly: true,
	},
];

/** What this user sees: admin pages stay hidden until they are known admin. */
export const navItemsFor = (isAdmin: boolean) =>
	NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly);

export function isActive(pathname: string, href: string): boolean {
	return href === "/"
		? pathname === "/" || pathname.startsWith("/items")
		: pathname === href || pathname.startsWith(`${href}/`);
}
