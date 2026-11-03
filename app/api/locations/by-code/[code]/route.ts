import { type RouteParams, withAuth } from "@/lib/http/handler";
import { getLocationByCode } from "@/lib/locations/service";

export const GET = withAuth<RouteParams<{ code: string }>>(
	async (_request, { params }) => {
		const { code } = await params;
		return Response.json(await getLocationByCode(decodeURIComponent(code)));
	},
);
