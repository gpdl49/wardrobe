import type { PhotoUploadDto } from "@/lib/api/types";
import { parseBody, withAuth } from "@/lib/http/handler";
import { withIdempotency } from "@/lib/http/idempotency";
import { createPhotoSchema } from "@/lib/photos/schema";
import { createPhotoUpload, refreshPhotoUpload } from "@/lib/photos/service";

export const POST = withAuth(
	withIdempotency(
		async (request) => {
			const input = await parseBody(request, createPhotoSchema);
			return Response.json(await createPhotoUpload(input), { status: 201 });
		},
		{
			// A replay re-presigns the PUT: the stored URL may have expired.
			replay: async (stored) =>
				stored.status === 201
					? {
							status: stored.status,
							body: await refreshPhotoUpload(stored.body as PhotoUploadDto),
						}
					: stored,
		},
	),
);
