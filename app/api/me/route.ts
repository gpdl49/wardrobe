import { withAuth } from "@/lib/http/handler";

export const GET = withAuth(async (_request, _context, user) =>
	Response.json({
		sub: user.sub,
		email: user.email,
		username: user.username,
		groups: user.groups,
	}),
);
