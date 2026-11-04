import { parseBody, parseQuery, withAuth } from "@/lib/http/handler";
import {
	createLocationSchema,
	listLocationsQuery,
} from "@/lib/locations/schema";
import { createLocation, listLocations } from "@/lib/locations/service";

export const GET = withAuth(async (request, _context, user) => {
	const query = parseQuery(request, listLocationsQuery);
	return Response.json(await listLocations(user, query));
});

export const POST = withAuth(async (request, _context, user) => {
	const input = await parseBody(request, createLocationSchema);
	return Response.json(await createLocation(user, input), { status: 201 });
});
