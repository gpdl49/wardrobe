import { rerunAnalysesSchema } from "@/lib/analyses/schema";
import { listAnalyses, rerunAnalyses } from "@/lib/analyses/service";
import { parseBody, type RouteParams, withAuth } from "@/lib/http/handler";

type Context = RouteParams<{ id: string }>;

export const GET = withAuth<Context>(async (_request, { params }, user) => {
	const { id } = await params;
	return Response.json(await listAnalyses(user, id));
});

/** Re-runs analyses; 202 because they complete in the background. */
export const POST = withAuth<Context>(async (request, { params }, user) => {
	const { id } = await params;
	// An empty body means "the default kinds".
	const input =
		request.headers.get("content-length") === "0" || !request.body
			? {}
			: await parseBody(request, rerunAnalysesSchema);
	return Response.json(await rerunAnalyses(user, id, input), { status: 202 });
});
