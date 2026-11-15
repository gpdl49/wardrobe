import { noContent, parseBody, withAuth } from "@/lib/http/handler";
import { connectionSchema } from "@/lib/immich/schema";
import { connect, disconnect, status } from "@/lib/immich/service";
export const GET = withAuth(async (_r, _c, user) =>
	Response.json(await status(user)),
);
export const PUT = withAuth(async (r, _c, user) =>
	Response.json(
		await connect(user, (await parseBody(r, connectionSchema)).apiKey),
	),
);
export const DELETE = withAuth(async (_r, _c, user) => {
	await disconnect(user);
	return noContent();
});
