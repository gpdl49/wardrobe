import type { z } from "zod";
import { requireUser, type User } from "@/lib/auth";
import { badRequest, errorResponse } from "@/lib/http/errors";

/** Second argument Next passes to a route handler with dynamic segments. */
export type RouteParams<P extends Record<string, string>> = {
	params: Promise<P>;
};

export type AuthedHandler<C> = (
	request: Request,
	context: C,
	user: User,
) => Promise<Response> | Response;

/**
 * Wraps every authenticated API route: resolves the user (401/403), runs the
 * handler and maps anything thrown to the `{error, message}` shape.
 *
 *   export const GET = withAuth(async (request, { params }, user) => ...)
 */
export function withAuth<C = unknown>(handler: AuthedHandler<C>) {
	return async (request: Request, context: C): Promise<Response> => {
		try {
			const user = requireUser(request);
			return await handler(request, context, user);
		} catch (err) {
			return errorResponse(err);
		}
	};
}

/** Parses and validates a JSON body; 400 on malformed JSON or schema errors. */
export async function parseBody<T extends z.ZodType>(
	request: Request,
	schema: T,
): Promise<z.output<T>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw badRequest("Body must be valid JSON");
	}
	return schema.parse(raw);
}

/** Validates the query string (as a flat record); 400 on schema errors. */
export function parseQuery<T extends z.ZodType>(
	request: Request,
	schema: T,
): z.output<T> {
	const params = new URL(request.url).searchParams;
	return schema.parse(Object.fromEntries(params.entries()));
}

export const noContent = () => new Response(null, { status: 204 });
