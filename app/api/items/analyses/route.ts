import { bulkAnalysesSchema } from "@/lib/analyses/schema";
import { bulkQueueAnalyses } from "@/lib/analyses/service";
import { parseBody, withAuth } from "@/lib/http/handler";
export const POST = withAuth(async (request, _context, user) =>
	Response.json(
		await bulkQueueAnalyses(user, await parseBody(request, bulkAnalysesSchema)),
		{ status: 202 },
	),
);
