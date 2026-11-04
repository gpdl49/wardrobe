import {
	noContent,
	parseBody,
	type RouteParams,
	withAuth,
} from "@/lib/http/handler";
import { updatePhotoSchema } from "@/lib/photos/schema";
import { deletePhoto, updatePhoto } from "@/lib/photos/service";

type Context = RouteParams<{ id: string }>;

export const PATCH = withAuth<Context>(async (request, { params }, user) => {
	const { id } = await params;
	const input = await parseBody(request, updatePhotoSchema);
	return Response.json(await updatePhoto(user, id, input));
});

export const DELETE = withAuth<Context>(async (_request, { params }, user) => {
	const { id } = await params;
	await deletePhoto(user, id);
	return noContent();
});
