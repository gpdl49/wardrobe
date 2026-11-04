import { type RouteParams, withAuth } from "@/lib/http/handler";
import { endSession } from "@/lib/sessions/service";

export const POST = withAuth<RouteParams<{ id: string }>>(
	async (_request, { params }, user) => {
		const { id } = await params;
		return Response.json(await endSession(user, id));
	},
);
