import { updateCategorySchema } from "@/lib/categories/schema";
import { deleteCategory, updateCategory } from "@/lib/categories/service";
import {
	noContent,
	parseBody,
	type RouteParams,
	withAuth,
} from "@/lib/http/handler";

type Context = RouteParams<{ id: string }>;

export const PATCH = withAuth<Context>(async (request, { params }) => {
	const { id } = await params;
	const input = await parseBody(request, updateCategorySchema);
	return Response.json(await updateCategory(id, input));
});

export const DELETE = withAuth<Context>(async (_request, { params }) => {
	const { id } = await params;
	await deleteCategory(id);
	return noContent();
});
