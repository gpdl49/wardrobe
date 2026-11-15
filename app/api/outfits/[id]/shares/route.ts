import { parseBody, type RouteParams, withAuth } from "@/lib/http/handler";
import { outfitShareSchema } from "@/lib/outfits/schema";
import { createOutfitShare } from "@/lib/outfits/service";

type Context = RouteParams<{ id: string }>;
export const POST = withAuth<Context>(async (r, { params }, user) =>
	Response.json(
		await createOutfitShare(
			user,
			(await params).id,
			(await parseBody(r, outfitShareSchema)).grantee,
		),
		{ status: 201 },
	),
);
