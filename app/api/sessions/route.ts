import { parseBody, withAuth } from "@/lib/http/handler";
import { withIdempotency } from "@/lib/http/idempotency";
import { createSessionSchema } from "@/lib/sessions/schema";
import { createSession } from "@/lib/sessions/service";

export const POST = withAuth(
	withIdempotency(async (request, _context, user) => {
		const input = await parseBody(request, createSessionSchema);
		return Response.json(await createSession(user, input), { status: 201 });
	}),
);
