import { type RouteParams, withAuth } from "@/lib/http/handler";
import { completePhoto } from "@/lib/photos/service";

type Context = RouteParams<{ id: string }>;

export const POST = withAuth<Context>(async (_request, { params }, user) => {
	const { id } = await params;
	return Response.json(await completePhoto(user, id));
});
