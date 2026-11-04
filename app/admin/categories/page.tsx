import type { Metadata } from "next";
import { CategoryAdmin } from "@/components/admin/category-admin";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
	return (
		<>
			<PageHeader title="Categories" />
			<div className="max-w-3xl">
				<CategoryAdmin />
			</div>
		</>
	);
}
