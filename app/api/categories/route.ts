import { createCategorySchema } from "@/lib/categories/schema";
import { createCategory, listCategories } from "@/lib/categories/service";
import { parseBody, withAuth } from "@/lib/http/handler";

export const GET = withAuth(async () => {
	return Response.json(await listCategories());
});

export const POST = withAuth(async (request) => {
	const input = await parseBody(request, createCategorySchema);
	return Response.json(await createCategory(input), { status: 201 });
});
