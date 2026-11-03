import { z } from "zod";
import type {
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
 */

export function toPackingSessionDto(
	session: PackingSession,
): PackingSessionDto {
	return {
		id: session.id,
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

export async function createSession(
	input: CreateSessionInput,
): Promise<PackingSessionDto> {
	const location = await db().location.findUnique({
		where: { id: input.locationId },
		select: { id: true },
	});
	if (!location) {
		throw unprocessable("Location does not exist");
	}
	return toPackingSessionDto(
		await db().packingSession.create({
			data: { mode: input.mode, locationId: input.locationId },
		}),
	);
}

/** Idempotent: ending an ended session returns it unchanged. */
export async function endSession(id: string): Promise<PackingSessionDto> {
	const sessionId = parseId(id);
	const session = await db().packingSession.findUnique({
		where: { id: sessionId },
	});
	if (!session) {
		throw notFound("Packing session not found");
	}
	if (session.endedAt) {
		return toPackingSessionDto(session);
	}
	return toPackingSessionDto(
		await db().packingSession.update({
			where: { id: sessionId },
			data: { endedAt: new Date() },
		}),
	);
}

/** Items moved in the session, most recently created first. */
export async function getSession(id: string): Promise<PackingSessionDetailDto> {
	const sessionId = parseId(id);
	const session = await db().packingSession.findUnique({
		where: { id: sessionId },
		include: { location: { select: locationRefSelect } },
	});
	if (!session) {
		throw notFound("Packing session not found");
	}
	const items = await db().item.findMany({
		where: { movements: { some: { sessionId } } },
		include: itemSummaryInclude,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
	});
	const { location, ...row } = session;
	return {
		...toPackingSessionDto(row),
		location: toLocationRef(location),
		items: items.map(toItemSummaryDto),
	};
}
