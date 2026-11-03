import { parseBody, withAuth } from "@/lib/http/handler";
import { createPhotoSchema } from "@/lib/photos/schema";
import { createPhotoUpload } from "@/lib/photos/service";

export const POST = withAuth(async (request) => {
	const input = await parseBody(request, createPhotoSchema);
	return Response.json(await createPhotoUpload(input), { status: 201 });
});
