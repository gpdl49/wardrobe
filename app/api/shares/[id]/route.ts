import {
	noContent,
	parseBody,
	type RouteParams,
	withAuth,
} from "@/lib/http/handler";
import { updateShareSchema } from "@/lib/shares/schema";
import { deleteShare, updateShare } from "@/lib/shares/service";

type Context = RouteParams<{ id: string }>;

export const PATCH = withAuth<Context>(async (request, { params }, user) => {
	const { id } = await params;
	const input = await parseBody(request, updateShareSchema);
	return Response.json(await updateShare(user, id, input));
});

export const DELETE = withAuth<Context>(async (_request, { params }, user) => {
	const { id } = await params;
	await deleteShare(user, id);
	return noContent();
});
