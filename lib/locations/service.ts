import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { conflict, notFound, unprocessable } from "@/lib/http/errors";
import { itemSummaryInclude, toItemSummaryDto } from "@/lib/items/present";
import type {
	CreateLocationInput,
	ListLocationsQuery,
	UpdateLocationInput,
} from "@/lib/locations/schema";
import { idParam, locationCode } from "@/lib/locations/schema";

/**
 * Locations: data access and rules, kept out of the route handlers so pages
 * and other features can reuse them. Throws ApiErrors; never returns them.
 */

const withItemCount = { _count: { select: { items: true } } } as const;

type CountedLocation = Prisma.LocationGetPayload<{
	include: typeof withItemCount;
}>;

function present<T extends CountedLocation>({ _count, ...location }: T) {
	return { ...location, itemCount: _count.items };
}

export async function listLocations(query: ListLocationsQuery) {
	const where: Prisma.LocationWhereInput = {};
	if (query.kind) {
		where.kind = query.kind;
	}
	if (!query.archived) {
		where.archivedAt = null;
	}
	if (query.q) {
		where.OR = [
			{ code: { contains: query.q, mode: "insensitive" } },
			{ name: { contains: query.q, mode: "insensitive" } },
			{ notes: { contains: query.q, mode: "insensitive" } },
		];
	}
	const rows = await db().location.findMany({
		where,
		include: withItemCount,
		orderBy: [{ kind: "asc" }, { code: "asc" }],
	});
	return rows.map(present);
}

/** Path ids that are not UUIDs cannot exist: 404, not 400. */
function parseId(id: string): string {
	const parsed = idParam.safeParse(id);
	if (!parsed.success) {
		throw notFound("Location not found");
	}
	return parsed.data;
}

export async function getLocation(id: string) {
	const location = await db().location.findUnique({
		where: { id: parseId(id) },
		include: {
			...withItemCount,
			items: {
				include: itemSummaryInclude,
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			},
			children: { include: withItemCount, orderBy: { code: "asc" } },
		},
	});
	if (!location) {
		throw notFound("Location not found");
	}
	const { items, children, ...rest } = location;
	return {
		...present(rest),
		items: items.map(toItemSummaryDto),
		children: children.map(present),
	};
}

export async function getLocationByCode(code: string) {
	const parsed = locationCode.safeParse(code);
	const location = parsed.success
		? await db().location.findUnique({
				where: { code: parsed.data },
				include: withItemCount,
			})
		: null;
	if (!location) {
		throw notFound("Location not found");
	}
	return present(location);
}

async function assertCodeFree(code: string, exceptId?: string) {
	const existing = await db().location.findUnique({
		where: { code },
		select: { id: true },
	});
	if (existing && existing.id !== exceptId) {
		throw conflict(`Location code ${code} is already in use`);
	}
}

/** The parent must exist and must not be the location itself or below it. */
async function assertValidParent(parentId: string, selfId?: string) {
	let cursor: string | null = parentId;
	const seen = new Set<string>();
	while (cursor) {
		if (cursor === selfId) {
			throw unprocessable("A location cannot be inside itself");
		}
		if (seen.has(cursor)) {
			break;
		}
		seen.add(cursor);
		const node: { parentId: string | null } | null =
			await db().location.findUnique({
				where: { id: cursor },
				select: { parentId: true },
			});
		if (!node) {
			if (cursor === parentId) {
				throw unprocessable("Parent location does not exist");
			}
			break;
		}
		cursor = node.parentId;
	}
}

export async function createLocation(input: CreateLocationInput) {
	await assertCodeFree(input.code);
	if (input.parentId) {
		await assertValidParent(input.parentId);
	}
	const location = await db().location.create({
		data: {
			kind: input.kind,
			code: input.code,
			name: input.name,
			notes: input.notes ?? null,
			parentId: input.parentId ?? null,
		},
		include: withItemCount,
	});
	return present(location);
}

export async function updateLocation(id: string, input: UpdateLocationInput) {
	const locationId = parseId(id);
	const existing = await db().location.findUnique({
		where: { id: locationId },
		select: { id: true },
	});
	if (!existing) {
		throw notFound("Location not found");
	}
	if (input.code !== undefined) {
		await assertCodeFree(input.code, locationId);
	}
	if (input.parentId) {
		await assertValidParent(input.parentId, locationId);
	}
	const location = await db().location.update({
		where: { id: locationId },
		data: {
			kind: input.kind,
			code: input.code,
			name: input.name,
			notes: input.notes,
			parentId: input.parentId,
			archivedAt:
				input.archivedAt === undefined
					? undefined
					: input.archivedAt === null
						? null
						: new Date(input.archivedAt),
		},
		include: withItemCount,
	});
	return present(location);
}

/** 409 while items are still in it; child locations are detached. */
export async function deleteLocation(id: string) {
	const locationId = parseId(id);
	const location = await db().location.findUnique({
		where: { id: locationId },
		include: withItemCount,
	});
	if (!location) {
		throw notFound("Location not found");
	}
	if (location._count.items > 0) {
		throw conflict(
			`Location ${location.code} still holds ${location._count.items} item(s); move them first`,
		);
	}
	await db().location.delete({ where: { id: locationId } });
}
