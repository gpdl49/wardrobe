import { type RouteParams, withAuth } from "@/lib/http/handler";
import { uuid, variantSchema } from "@/lib/immich/schema";
import { variant } from "@/lib/immich/service";
export const GET = withAuth(
	async (
		_r,
		{ params }: RouteParams<{ id: string; linkId: string; variant: string }>,
		user,
	) => {
		const p = await params;
		return variant(
			user,
			uuid.parse(p.id),
			uuid.parse(p.linkId),
			variantSchema.parse(p.variant),
		);
	},
);
