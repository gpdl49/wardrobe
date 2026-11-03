import {
	Archive,
	FolderTree,
	type LucideIcon,
	MapPin,
	PackageOpen,
	QrCode,
	Shirt,
} from "lucide-react";

export type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	/** Shown in the mobile bottom bar (space for about five). */
	primary: boolean;
};

/** Pages from docs/wardrobe.md "Pages". */
export const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: "Catalogue", icon: Shirt, primary: true },
	{ href: "/locations", label: "Locations", icon: MapPin, primary: true },
	{ href: "/pack", label: "Pack", icon: Archive, primary: true },
	{ href: "/unpack", label: "Unpack", icon: PackageOpen, primary: true },
	{ href: "/admin/labels", label: "Labels", icon: QrCode, primary: false },
	{
		href: "/admin/categories",
		label: "Categories",
		icon: FolderTree,
		primary: false,
	},
];

export function isActive(pathname: string, href: string): boolean {
	return href === "/"
		? pathname === "/" || pathname.startsWith("/items")
		: pathname === href || pathname.startsWith(`${href}/`);
}
