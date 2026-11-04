import { withAuth } from "@/lib/http/handler";
import { listSharedWithMe } from "@/lib/shares/service";

export const GET = withAuth(async (_request, _context, user) =>
	Response.json(await listSharedWithMe(user)),
);
