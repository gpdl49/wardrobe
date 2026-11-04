import { applyAnalysisSchema } from "@/lib/analyses/schema";
import { applyAnalysis } from "@/lib/analyses/service";
import { parseBody, type RouteParams, withAuth } from "@/lib/http/handler";

type Context = RouteParams<{ id: string; analysisId: string }>;

export const POST = withAuth<Context>(async (request, { params }, user) => {
	const { id, analysisId } = await params;
	const input = await parseBody(request, applyAnalysisSchema);
	return Response.json(await applyAnalysis(user, id, analysisId, input));
});
