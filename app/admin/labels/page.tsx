import type { Metadata } from "next";
import { LabelsDesigner } from "@/components/admin/labels-designer";

export const metadata: Metadata = { title: "Labels" };

export default function Page() {
	return <LabelsDesigner />;
}
