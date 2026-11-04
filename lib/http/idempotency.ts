import { createHash } from "node:crypto";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { ApiError, errorResponse } from "@/lib/http/errors";
import type { AuthedHandler } from "@/lib/http/handler";

/**
 * `Idempotency-Key` for POSTs that create things (docs/wardrobe.md, "HTTP
 * API"). A client that retries a create after a lost response sends the same
 * key and gets the first response back instead of a duplicate.
 *
 * - No header: the handler runs as usual.
 * - First request with a key: a pending row is inserted under the unique
 *   (sub, key) constraint, the handler runs, and its status and JSON body are
 *   stored. 5xx responses are not stored (the row is deleted) so the request
 *   can be retried; 2xx and 4xx are.
 * - Same key, same route and body: the stored response is replayed (with
 *   `Idempotent-Replayed: true`).
 * - Same key while the first request is still running: 409
 *   `idempotency_in_progress` with `Retry-After`.
 * - Same key with a different body or route: 422 `idempotency_key_reused`.
 *
 * Keys are scoped per user and forgotten after IDEMPOTENCY_TTL_MS.
 */

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const REPLAYED_HEADER = "idempotent-replayed";
export const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
/** Rows older than this are deleted (on write) and their keys can be reused. */
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A pending row older than this belongs to a request that died: take it over. */
export const IDEMPOTENCY_LOCK_MS = 60 * 1000;
/** Seconds a client should wait when the first request is still running. */
export const IDEMPOTENCY_RETRY_AFTER_SECONDS = 1;

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/**
 * The validated key, or null without the header. 400
 * `invalid_idempotency_key` for an empty, too long or non-printable-ASCII key.
 */
export function parseIdempotencyKey(value: string | null): string | null {
	if (value === null) {
		return null;
	}
	const key = value.trim();
	if (key.length === 0) {
		throw invalidKey("must not be empty");
	}
	if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
		throw invalidKey(
			`must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
		);
	}
	if (!PRINTABLE_ASCII.test(key)) {
		throw invalidKey("must be printable ASCII");
	}
	return key;
}

const invalidKey = (reason: string) =>
	new ApiError(400, `Idempotency-Key ${reason}`, "invalid_idempotency_key");

export function hashBody(body: string): string {
	return createHash("sha256").update(body).digest("hex");
}

/** A response as stored for replay. */
export type StoredResponse = { status: number; body: unknown };

export type IdempotencyOptions = {
	/**
	 * Adjusts a stored response before it is replayed, e.g. to refresh a
	 * presigned URL that has expired since.
	 */
	replay?: (stored: StoredResponse, user: Viewer) => Promise<StoredResponse>;
};

type Claim =
	/** `lockedAt` fences the owner: a takeover changes it. */
	| { kind: "owner"; id: string; lockedAt: Date }
	| { kind: "replay"; stored: StoredResponse }
	| { kind: "in_progress" };

/**
 * Wraps an authenticated POST handler (inside withAuth):
 *
 *   export const POST = withAuth(withIdempotency(async (request) => ...))
 */
export function withIdempotency<C>(
	handler: AuthedHandler<C>,
	options: IdempotencyOptions = {},
): AuthedHandler<C> {
	return async (request, context, user) => {
		const key = parseIdempotencyKey(request.headers.get(IDEMPOTENCY_HEADER));
		if (key === null) {
			return handler(request, context, user);
		}
		const bodyText = await request.text();
		const route = `${request.method} ${new URL(request.url).pathname}`;
		const claim = await claimKey(user.sub, key, route, hashBody(bodyText));

		if (claim.kind === "in_progress") {
			return Response.json(
				{
					error: "idempotency_in_progress",
					message:
						"A request with this Idempotency-Key is still being processed",
				},
				{
					status: 409,
					headers: { "Retry-After": String(IDEMPOTENCY_RETRY_AFTER_SECONDS) },
				},
			);
		}
		if (claim.kind === "replay") {
			const stored = options.replay
				? await options.replay(claim.stored, user)
				: claim.stored;
			return replayResponse(stored);
		}

		// The body has been read: hand the handler a fresh request.
		const forwarded = new Request(request.url, {
			method: request.method,
			headers: request.headers,
			body: bodyText,
		});
		let response: Response;
		try {
			response = await handler(forwarded, context, user);
		} catch (err) {
			response = errorResponse(err);
		}
		await storeResponse(claim, response);
		return response;
	};
}

function replayResponse(stored: StoredResponse): Response {
	const headers = { [REPLAYED_HEADER]: "true" };
	if (stored.body === null) {
		return new Response(null, { status: stored.status, headers });
	}
	return Response.json(stored.body, { status: stored.status, headers });
}

/**
 * Inserts the pending row, or finds what an earlier request with the key left.
 * The unique (sub, key) constraint makes exactly one concurrent request the
 * owner.
 */
async function claimKey(
	sub: string,
	key: string,
	route: string,
	requestHash: string,
): Promise<Claim> {
	const now = Date.now();
	await db().idempotencyKey.deleteMany({
		where: { createdAt: { lt: new Date(now - IDEMPOTENCY_TTL_MS) } },
	});
	// A row can vanish between the insert and the read (a 5xx releases it).
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const row = await db().idempotencyKey.create({
				// Set here (ms precision) rather than by the database: it is compared
				// for equality to fence the owner.
				data: { sub, key, route, requestHash, lockedAt: new Date() },
				select: { id: true, lockedAt: true },
			});
			return { kind: "owner", id: row.id, lockedAt: row.lockedAt };
		} catch (err) {
			if (!isUniqueViolation(err)) {
				throw err;
			}
		}
		const existing = await db().idempotencyKey.findUnique({
			where: { sub_key: { sub, key } },
		});
		if (!existing) {
			continue;
		}
		if (existing.route !== route || existing.requestHash !== requestHash) {
			throw new ApiError(
				422,
				"This Idempotency-Key was already used for a different request",
				"idempotency_key_reused",
			);
		}
		if (existing.status !== null) {
			return {
				kind: "replay",
				stored: { status: existing.status, body: existing.responseBody },
			};
		}
		if (existing.lockedAt.getTime() > Date.now() - IDEMPOTENCY_LOCK_MS) {
			return { kind: "in_progress" };
		}
		// The request that took the key died without answering: take over.
		const lockedAt = new Date();
		const { count } = await db().idempotencyKey.updateMany({
			where: { id: existing.id, status: null, lockedAt: existing.lockedAt },
			data: { lockedAt },
		});
		if (count === 1) {
			return { kind: "owner", id: existing.id, lockedAt };
		}
		return { kind: "in_progress" };
	}
	return { kind: "in_progress" };
}

function isUniqueViolation(err: unknown): boolean {
	return (
		err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
	);
}

/**
 * Stores a 2xx/4xx JSON response; releases the key on a 5xx (or a body that
 * cannot be replayed) so a retry runs the handler again. Only while this
 * request still holds the lock: one that was taken over leaves the row alone.
 */
async function storeResponse(
	owner: { id: string; lockedAt: Date },
	response: Response,
): Promise<void> {
	const where = { id: owner.id, lockedAt: owner.lockedAt, status: null };
	try {
		let body: unknown = null;
		let replayable = response.status < 500;
		if (replayable) {
			const text = await response.clone().text();
			if (text) {
				try {
					body = JSON.parse(text);
				} catch {
					replayable = false;
				}
			}
		}
		if (!replayable) {
			await db().idempotencyKey.deleteMany({ where });
			return;
		}
		await db().idempotencyKey.updateMany({
			where,
			data: {
				status: response.status,
				responseBody:
					body === null ? Prisma.DbNull : (body as Prisma.InputJsonValue),
				completedAt: new Date(),
			},
		});
	} catch (err) {
		// The client still gets its answer; a retry meets the pending row (409)
		// until the lock goes stale.
		console.error("Could not store the idempotent response", err);
	}
}
