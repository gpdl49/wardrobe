import type { Metadata } from "next";
import { CategoryTreeEditor } from "@/components/admin/category-tree-editor";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
	return (
		<>
			<PageHeader title="Categories" />
			<div className="max-w-3xl">
				<CategoryTreeEditor />
			</div>
		</>
	);
}
