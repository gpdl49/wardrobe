import { withAuth } from "@/lib/http/handler";
import { sharedWithMe } from "@/lib/outfits/service";
export const GET = withAuth(async (_r, _c, user) =>
	Response.json(await sharedWithMe(user)),
);
