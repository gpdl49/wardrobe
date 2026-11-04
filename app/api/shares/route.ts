import { parseBody, withAuth } from "@/lib/http/handler";
import { createShareSchema } from "@/lib/shares/schema";
import { createShare, listShares } from "@/lib/shares/service";

export const GET = withAuth(async (_request, _context, user) =>
	Response.json(await listShares(user)),
);

export const POST = withAuth(async (request, _context, user) => {
	const input = await parseBody(request, createShareSchema);
	return Response.json(await createShare(user, input), { status: 201 });
});
