import { withAuth } from "@/lib/http/handler";
import { listTags } from "@/lib/tags/service";

export const GET = withAuth(async () => {
	return Response.json(await listTags());
});
