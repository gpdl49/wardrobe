import { parseBody, withAuth } from "@/lib/http/handler";
import { moveItemsSchema } from "@/lib/items/schema";
import { moveItems } from "@/lib/items/service";

export const POST = withAuth(async (request, _context, user) => {
	const input = await parseBody(request, moveItemsSchema);
	return Response.json(await moveItems(user, input));
});
