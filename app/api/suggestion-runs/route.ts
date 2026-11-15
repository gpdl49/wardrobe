import { parseBody, parseQuery, withAuth } from "@/lib/http/handler";
import { withIdempotency } from "@/lib/http/idempotency";
import {
	createSuggestionRunSchema,
	listSuggestionRunsSchema,
} from "@/lib/suggestions/schema";
import { createRun, listRuns, requireRunEdit } from "@/lib/suggestions/service";
export const GET = withAuth(async (request, _context, user) =>
	Response.json(
		await listRuns(user, parseQuery(request, listSuggestionRunsSchema).owner),
	),
);
export const POST = withAuth(
	withIdempotency(
		async (request, _context, user) =>
			Response.json(
				await createRun(
					user,
					await parseBody(request, createSuggestionRunSchema),
				),
				{ status: 202 },
			),
		{
			replay: async (stored, user) => {
				if (stored.status === 202)
					await requireRunEdit(user, (stored.body as { id: string }).id);
				return stored;
			},
		},
	),
);
