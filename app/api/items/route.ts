import { parseBody, parseQuery, withAuth } from "@/lib/http/handler";
import { withIdempotency } from "@/lib/http/idempotency";
import { createItemSchema, listItemsQuery } from "@/lib/items/schema";
import { createItem, listItems } from "@/lib/items/service";

export const GET = withAuth(async (request) => {
	const query = parseQuery(request, listItemsQuery);
	return Response.json(await listItems(query));
});

export const POST = withAuth(
	withIdempotency(async (request) => {
		const input = await parseBody(request, createItemSchema);
		return Response.json(await createItem(input), { status: 201 });
	}),
);
