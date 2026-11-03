import {
	noContent,
	parseBody,
	type RouteParams,
	withAuth,
} from "@/lib/http/handler";
import { updateLocationSchema } from "@/lib/locations/schema";
import {
	deleteLocation,
	getLocation,
	updateLocation,
} from "@/lib/locations/service";

type Context = RouteParams<{ id: string }>;

export const GET = withAuth<Context>(async (_request, { params }) => {
	const { id } = await params;
	return Response.json(await getLocation(id));
});

export const PATCH = withAuth<Context>(async (request, { params }) => {
	const { id } = await params;
	const input = await parseBody(request, updateLocationSchema);
	return Response.json(await updateLocation(id, input));
});

export const DELETE = withAuth<Context>(async (_request, { params }) => {
	const { id } = await params;
	await deleteLocation(id);
	return noContent();
});
