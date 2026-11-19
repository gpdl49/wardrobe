import { type RouteParams, withAuth } from "@/lib/http/handler";
import { queuePhotoBackground } from "@/lib/photos/service";

type Context = RouteParams<{ id: string }>;

export const POST = withAuth<Context>(async (_request, { params }, user) => {
	const { id } = await params;
	return Response.json(await queuePhotoBackground(user, id), { status: 202 });
});
