import {
	noContent,
	parseBody,
	type RouteParams,
	withAuth,
} from "@/lib/http/handler";
import { updateOutfitSchema } from "@/lib/outfits/schema";
import { deleteOutfit, getOutfit, updateOutfit } from "@/lib/outfits/service";

type Context = RouteParams<{ id: string }>;
export const GET = withAuth<Context>(async (_r, { params }, user) =>
	Response.json(await getOutfit(user, (await params).id)),
);
export const PATCH = withAuth<Context>(async (r, { params }, user) =>
	Response.json(
		await updateOutfit(
			user,
			(await params).id,
			await parseBody(r, updateOutfitSchema),
		),
	),
);
export const DELETE = withAuth<Context>(async (_r, { params }, user) => {
	await deleteOutfit(user, (await params).id);
	return noContent();
});
