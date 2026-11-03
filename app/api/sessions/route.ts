import { parseBody, withAuth } from "@/lib/http/handler";
import { createSessionSchema } from "@/lib/sessions/schema";
import { createSession } from "@/lib/sessions/service";

export const POST = withAuth(async (request) => {
	const input = await parseBody(request, createSessionSchema);
	return Response.json(await createSession(input), { status: 201 });
});
