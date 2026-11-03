import { rerunAnalysesSchema } from "@/lib/analyses/schema";
import { listAnalyses, rerunAnalyses } from "@/lib/analyses/service";
import { parseBody, type RouteParams, withAuth } from "@/lib/http/handler";

type Context = RouteParams<{ id: string }>;

export const GET = withAuth<Context>(async (_request, { params }) => {
	const { id } = await params;
	return Response.json(await listAnalyses(id));
});

/** Re-runs analyses; 202 because they complete in the background. */
export const POST = withAuth<Context>(async (request, { params }) => {
	const { id } = await params;
	// An empty body means "the default kinds".
	const input =
		request.headers.get("content-length") === "0" || !request.body
			? {}
			: await parseBody(request, rerunAnalysesSchema);
	return Response.json(await rerunAnalyses(id, input), { status: 202 });
});
