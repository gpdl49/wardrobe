import { parseBody, parseQuery, withAuth } from "@/lib/http/handler";
import { withIdempotency } from "@/lib/http/idempotency";
import { createItemSchema, listItemsQuery } from "@/lib/items/schema";
import { createItem, listItems } from "@/lib/items/service";

export const GET = withAuth(async (request, _context, user) => {
	const query = parseQuery(request, listItemsQuery);
	return Response.json(await listItems(user, query));
});

export const POST = withAuth(
	withIdempotency(async (request, _context, user) => {
		const input = await parseBody(request, createItemSchema);
		return Response.json(await createItem(user, input), { status: 201 });
	}),
);
