import { type RouteParams, withAuth } from "@/lib/http/handler";
import { getRun } from "@/lib/suggestions/service";
export const GET = withAuth(
	async (_request, context: RouteParams<{ id: string }>, user) =>
		Response.json(await getRun(user, (await context.params).id)),
);
