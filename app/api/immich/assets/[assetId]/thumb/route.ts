import { type RouteParams, withAuth } from "@/lib/http/handler";
import { uuid } from "@/lib/immich/schema";
import { pickerThumb } from "@/lib/immich/service";
export const GET = withAuth(
	async (_r, { params }: RouteParams<{ assetId: string }>, user) =>
		pickerThumb(user, uuid.parse((await params).assetId)),
);
