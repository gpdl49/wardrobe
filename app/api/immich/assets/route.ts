import { parseQuery, withAuth } from "@/lib/http/handler";
import { searchSchema } from "@/lib/immich/schema";
import { search } from "@/lib/immich/service";
export const GET = withAuth(async (r, _c, user) =>
	Response.json(await search(user, parseQuery(r, searchSchema))),
);
