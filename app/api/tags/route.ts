import { parseQuery, withAuth } from "@/lib/http/handler";
import { listTagsQuery } from "@/lib/tags/schema";
import { listTags } from "@/lib/tags/service";

export const GET = withAuth(async (request, _context, user) => {
	const { owner } = parseQuery(request, listTagsQuery);
	return Response.json(await listTags(user, owner));
});
