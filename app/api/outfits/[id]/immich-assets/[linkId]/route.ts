import { noContent, type RouteParams, withAuth } from "@/lib/http/handler";
import { uuid } from "@/lib/immich/schema";
import { unlink } from "@/lib/immich/service";
export const DELETE = withAuth(
	async (_r, { params }: RouteParams<{ id: string; linkId: string }>, user) => {
		const p = await params;
		await unlink(user, uuid.parse(p.id), uuid.parse(p.linkId));
		return noContent();
	},
);
