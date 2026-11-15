import { noContent, type RouteParams, withAuth } from "@/lib/http/handler";
import { deleteOutfitShare } from "@/lib/outfits/service";

type Context = RouteParams<{ id: string; shareId: string }>;
export const DELETE = withAuth<Context>(async (_r, { params }, user) => {
	const { id, shareId } = await params;
	await deleteOutfitShare(user, id, shareId);
	return noContent();
});
