import { parseBody, type RouteParams, withAuth } from "@/lib/http/handler";
import { linkSchema, uuid } from "@/lib/immich/schema";
import { link } from "@/lib/immich/service";
export const POST = withAuth(
	async (r, { params }: RouteParams<{ id: string }>, user) =>
		Response.json(
			await link(
				user,
				uuid.parse((await params).id),
				(await parseBody(r, linkSchema)).assetIds,
			),
			{ status: 201 },
		),
);
