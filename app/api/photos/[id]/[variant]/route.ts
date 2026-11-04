import { type RouteParams, withAuth } from "@/lib/http/handler";
import { VARIANT_CACHE_CONTROL, variantUrl } from "@/lib/photos/service";

type Context = RouteParams<{ id: string; variant: string }>;

export const GET = withAuth<Context>(async (_request, { params }, user) => {
	const { id, variant } = await params;
	return new Response(null, {
		status: 302,
		headers: {
			Location: await variantUrl(user, id, variant),
			"Cache-Control": VARIANT_CACHE_CONTROL,
		},
	});
});
