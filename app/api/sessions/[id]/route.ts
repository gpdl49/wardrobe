import { type RouteParams, withAuth } from "@/lib/http/handler";
import { getSession } from "@/lib/sessions/service";

export const GET = withAuth<RouteParams<{ id: string }>>(
	async (_request, { params }) => {
		const { id } = await params;
		return Response.json(await getSession(id));
	},
);
