import {
	noContent,
	parseBody,
	type RouteParams,
	withAuth,
} from "@/lib/http/handler";
import { updateItemSchema } from "@/lib/items/schema";
import { deleteItem, getItem, updateItem } from "@/lib/items/service";

type Context = RouteParams<{ id: string }>;

export const GET = withAuth<Context>(async (_request, { params }) => {
	const { id } = await params;
	return Response.json(await getItem(id));
});

export const PATCH = withAuth<Context>(async (request, { params }) => {
	const { id } = await params;
	const input = await parseBody(request, updateItemSchema);
	return Response.json(await updateItem(id, input));
});

export const DELETE = withAuth<Context>(async (_request, { params }) => {
	const { id } = await params;
	await deleteItem(id);
	return noContent();
});
