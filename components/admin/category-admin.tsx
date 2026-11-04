"use client";

import { ShieldAlert } from "lucide-react";
import { CategoryTreeEditor } from "@/components/admin/category-tree-editor";
import { EmptyState, Loading } from "@/components/ui/feedback";
import { useCurrentUser } from "@/lib/client/current-user";

/** Categories are one global tree: only ADMIN_GROUP edits them. */
export function CategoryAdmin() {
	const me = useCurrentUser();
	if (!me) {
		return <Loading />;
	}
	if (!me.isAdmin) {
		return (
			<EmptyState icon={<ShieldAlert />} title="Admins only">
				Categories are shared by everyone, so only admins can change them.
			</EmptyState>
		);
	}
	return <CategoryTreeEditor />;
}
