import { z } from "zod";
import {
	type AccessContext,
	accessToLocation,
	loadAccess,
	readableItems,
	requireEdit,
	requireRead,
} from "@/lib/access";
import type {
	Access,
	PackingSessionDetailDto,
	PackingSessionDto,
} from "@/lib/api/types";
import { db } from "@/lib/db";
import type { PackingSession } from "@/lib/generated/prisma/client";
import { notFound, unprocessable } from "@/lib/http/errors";
import {
	itemSummaryInclude,
	locationRefSelect,
	toItemSummaryDto,
	toLocationRef,
} from "@/lib/items/present";
import type { CreateSessionInput } from "@/lib/sessions/schema";

/**
 * Packing sessions group the moves made while packing or unpacking one
 * location. Moves reference a session through POST /api/items/move (or
 * POST/PATCH /api/items) `sessionId`; an ended session accepts no more moves.
 * A session belongs to its location's owner and follows that location's access.
 */

type Viewer = { id: string };

export function toPackingSessionDto(
	session: PackingSession,
	access: Access,
): PackingSessionDto {
	return {
		id: session.id,
		ownerId: session.ownerId,
		access,
		mode: session.mode,
		locationId: session.locationId,
		startedAt: session.startedAt.toISOString(),
		endedAt: session.endedAt?.toISOString() ?? null,
	};
}

function parseId(id: string): string {
	const parsed = z.uuid().safeParse(id);
	if (!parsed.success) {
		throw notFound("Packing session not found");
	}
	return parsed.data;
}

const sessionAccess = (ctx: AccessContext, session: PackingSession) =>
	accessToLocation(ctx, { id: session.locationId, ownerId: session.ownerId });

export async function createSession(
	viewer: Viewer,
	input: CreateSessionInput,
): Promise<PackingSessionDto> {
	const ctx = await loadAccess(viewer);
	const location = await db().location.findUnique({
		where: { id: input.locationId },
		select: { id: true, ownerId: true },
	});
	const access = location && accessToLocation(ctx, location);
	if (!location || !access) {
		throw unprocessable("Location does not exist");
	}
	const granted = requireEdit(access, "Location");
	return toPackingSessionDto(
		await db().packingSession.create({
			data: {
				ownerId: location.ownerId,
				mode: input.mode,
				locationId: input.locationId,
			},
		}),
		granted,
	);
}

/** Idempotent: ending an ended session returns it unchanged. */
export async function endSession(
	viewer: Viewer,
	id: string,
): Promise<PackingSessionDto> {
	const ctx = await loadAccess(viewer);
	const sessionId = parseId(id);
	const session = await db().packingSession.findUnique({
		where: { id: sessionId },
	});
	if (!session) {
		throw notFound("Packing session not found");
	}
	const access = requireEdit(sessionAccess(ctx, session), "Packing session");
	if (session.endedAt) {
		return toPackingSessionDto(session, access);
	}
	return toPackingSessionDto(
		await db().packingSession.update({
			where: { id: sessionId },
			data: { endedAt: new Date() },
		}),
		access,
	);
}

/** Items the caller can see moved in the session, most recently created first. */
export async function getSession(
	viewer: Viewer,
	id: string,
): Promise<PackingSessionDetailDto> {
	const ctx = await loadAccess(viewer);
	const sessionId = parseId(id);
	const session = await db().packingSession.findUnique({
		where: { id: sessionId },
		include: { location: { select: locationRefSelect } },
	});
	if (!session) {
		throw notFound("Packing session not found");
	}
	const access = requireRead(sessionAccess(ctx, session), "Packing session");
	const items = await db().item.findMany({
		where: {
			AND: [
				readableItems(ctx, session.ownerId),
				{ movements: { some: { sessionId } } },
			],
		},
		include: itemSummaryInclude,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
	});
	const { location, ...row } = session;
	return {
		...toPackingSessionDto(row, access),
		location: toLocationRef(location),
		items: items.map((item) => toItemSummaryDto(item, ctx)),
	};
}
