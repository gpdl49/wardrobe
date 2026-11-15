import { bulkAnalysesSchema } from "@/lib/analyses/schema";
import { bulkApplyTags } from "@/lib/analyses/service";
import { parseBody, withAuth } from "@/lib/http/handler";
export const POST = withAuth(async (request, _context, user) =>
	Response.json(
		await bulkApplyTags(user, await parseBody(request, bulkAnalysesSchema)),
	),
);
