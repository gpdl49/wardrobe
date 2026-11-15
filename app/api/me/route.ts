import type { MeDto } from "@/lib/api/types";
import { features } from "@/lib/env";
import { withAuth } from "@/lib/http/handler";

export const GET = withAuth(async (_request, _context, user) =>
	Response.json({
		id: user.id,
		sub: user.sub,
		email: user.email,
		username: user.username,
		groups: user.groups,
		isAdmin: user.isAdmin,
		features: features(),
	} satisfies MeDto),
);
