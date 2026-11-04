import type { Metadata } from "next";
import { SharingPage } from "@/components/sharing/sharing-page";

export const metadata: Metadata = { title: "Sharing" };

export default function Page() {
	return <SharingPage />;
}
