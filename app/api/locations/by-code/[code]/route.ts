import { parseQuery, type RouteParams, withAuth } from "@/lib/http/handler";
import { locationByCodeQuery } from "@/lib/locations/schema";
import { getLocationByCode } from "@/lib/locations/service";

export const GET = withAuth<RouteParams<{ code: string }>>(
	async (request, { params }, user) => {
		const { code } = await params;
		const { owner } = parseQuery(request, locationByCodeQuery);
		return Response.json(
			await getLocationByCode(user, decodeURIComponent(code), owner),
		);
	},
);
