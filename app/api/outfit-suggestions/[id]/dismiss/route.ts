import { type RouteParams, withAuth } from "@/lib/http/handler";
import { dismissSuggestion } from "@/lib/suggestions/service";
export const POST = withAuth(
	async (_request, context: RouteParams<{ id: string }>, user) =>
		Response.json(await dismissSuggestion(user, (await context.params).id)),
);
