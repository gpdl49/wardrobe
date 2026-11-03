import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * API errors. Every non-2xx JSON response has the contract shape
 * `{error, message}` (docs/wardrobe.md, "HTTP API"): `error` is a stable
 * machine code, `message` is for humans.
 */
export type ErrorBody = { error: string; message: string };

export const ERROR_CODES = {
	400: "bad_request",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	409: "conflict",
	422: "unprocessable",
	500: "internal",
} as const;

export type ErrorStatus = keyof typeof ERROR_CODES;

export class ApiError extends Error {
	constructor(
		readonly status: ErrorStatus,
		message: string,
		readonly code: string = ERROR_CODES[status],
	) {
		super(message);
		this.name = "ApiError";
	}
}

export const badRequest = (message: string) => new ApiError(400, message);
export const unauthorized = (message = "Not signed in") =>
	new ApiError(401, message);
export const forbidden = (message = "Not allowed") =>
	new ApiError(403, message);
export const notFound = (message = "Not found") => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);
export const unprocessable = (message: string) => new ApiError(422, message);

/** "name: Too small; kind: Invalid option" — short enough for a toast. */
export function formatZodError(error: z.ZodError): string {
	return error.issues
		.map((issue) =>
			issue.path.length > 0
				? `${issue.path.join(".")}: ${issue.message}`
				: issue.message,
		)
		.join("; ");
}

/**
 * Maps anything thrown by a handler to a status and body. Unknown errors become
 * an opaque 500 (the details go to the log, not the client).
 */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
	if (err instanceof ApiError) {
		return {
			status: err.status,
			body: { error: err.code, message: err.message },
		};
	}
	if (err instanceof z.ZodError) {
		return {
			status: 400,
			body: { error: ERROR_CODES[400], message: formatZodError(err) },
		};
	}
	if (err instanceof Prisma.PrismaClientKnownRequestError) {
		switch (err.code) {
			// Unique constraint.
			case "P2002":
				return {
					status: 409,
					body: { error: ERROR_CODES[409], message: "Already exists" },
				};
			// Foreign key constraint (e.g. deleting a row something still references).
			case "P2003":
				return {
					status: 409,
					body: {
						error: ERROR_CODES[409],
						message: "Still referenced by other records",
					},
				};
			// Record to update/delete not found.
			case "P2025":
				return {
					status: 404,
					body: { error: ERROR_CODES[404], message: "Not found" },
				};
		}
	}
	return {
		status: 500,
		body: { error: ERROR_CODES[500], message: "Internal server error" },
	};
}

export function errorResponse(err: unknown): Response {
	const { status, body } = toErrorBody(err);
	if (status >= 500) {
		console.error("Unhandled API error", err);
	}
	return Response.json(body, { status });
}
