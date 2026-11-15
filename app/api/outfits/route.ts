import { parseBody, parseQuery, withAuth } from "@/lib/http/handler";
import { withIdempotency } from "@/lib/http/idempotency";
import { createOutfitSchema, listOutfitsQuery } from "@/lib/outfits/schema";
import { createOutfit, listOutfits } from "@/lib/outfits/service";
export const GET = withAuth(async (request, _context, user) =>
	Response.json(await listOutfits(user, parseQuery(request, listOutfitsQuery))),
);
export const POST = withAuth(
	withIdempotency(async (request, _context, user) =>
		Response.json(
			await createOutfit(user, await parseBody(request, createOutfitSchema)),
			{ status: 201 },
		),
	),
);
