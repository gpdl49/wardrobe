import type { ShareDto, SharedWithMeDto, UserRef } from "@/lib/api/types";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { conflict, notFound, unprocessable } from "@/lib/http/errors";
import { locationRefSelect, toLocationRef } from "@/lib/items/present";
import {
	type CreateShareInput,
	idParam,
	type UpdateShareInput,
} from "@/lib/shares/schema";

/**
 * Shares: an owner grants another user access to their whole wardrobe or one
 * location. Only the owner reads, changes or revokes a share, so these check
 * ownerId directly instead of going through lib/access: a whole-wardrobe
 * editor gets a 404 here like anyone else.
 */

const userRefSelect = {
	id: true,
	email: true,
	username: true,
} as const satisfies Prisma.UserSelect;

const shareInclude = {
	grantee: { select: userRefSelect },
	location: { select: locationRefSelect },
} as const satisfies Prisma.ShareInclude;

type ShareRow = Prisma.ShareGetPayload<{ include: typeof shareInclude }>;

function toShareDto(share: ShareRow): ShareDto {
	return {
		id: share.id,
		ownerId: share.ownerId,
		grantee: share.grantee,
		access: share.access,
		location: share.location ? toLocationRef(share.location) : null,
		createdAt: share.createdAt.toISOString(),
		updatedAt: share.updatedAt.toISOString(),
	};
}

export async function listShares(viewer: Viewer): Promise<ShareDto[]> {
	const rows = await db().share.findMany({
		where: { ownerId: viewer.id },
		include: shareInclude,
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});
	return rows.map(toShareDto);
}

/** Shares others have made with the caller. */
export async function listSharedWithMe(
	viewer: Viewer,
): Promise<SharedWithMeDto[]> {
	const rows = await db().share.findMany({
		where: { granteeId: viewer.id },
		include: {
			owner: { select: userRefSelect },
			location: { select: { id: true, code: true, name: true } },
		},
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});
	return rows.map((share) => ({
		id: share.id,
		owner: share.owner,
		access: share.access,
		location: share.location,
	}));
}

/** Case-insensitive; refuses to guess when several users match. */
async function findGrantee(value: string): Promise<UserRef> {
	const match = { equals: value, mode: "insensitive" } as const;
	const users = await db().user.findMany({
		where: { OR: [{ email: match }, { username: match }] },
		select: userRefSelect,
		take: 2,
	});
	const [user, another] = users;
	if (!user) {
		throw unprocessable(`No user "${value}"; they must sign in once first`);
	}
	if (another) {
		throw unprocessable(`More than one user matches "${value}"`);
	}
	return user;
}

export async function createShare(
	viewer: Viewer,
	input: CreateShareInput,
): Promise<ShareDto> {
	const grantee = await findGrantee(input.grantee);
	if (grantee.id === viewer.id) {
		throw unprocessable("You cannot share with yourself");
	}
	if (input.locationId) {
		const location = await db().location.findFirst({
			where: { id: input.locationId, ownerId: viewer.id },
			select: { id: true },
		});
		if (!location) {
			throw unprocessable("You can only share your own locations");
		}
	}
	try {
		return toShareDto(
			await db().share.create({
				data: {
					ownerId: viewer.id,
					granteeId: grantee.id,
					access: input.access,
					locationId: input.locationId ?? null,
				},
				include: shareInclude,
			}),
		);
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === "P2002"
		) {
			throw conflict("This is already shared with that user");
		}
		throw err;
	}
}

function parseId(id: string): string {
	const parsed = idParam.safeParse(id);
	if (!parsed.success) {
		throw notFound("Share not found");
	}
	return parsed.data;
}

export async function updateShare(
	viewer: Viewer,
	id: string,
	input: UpdateShareInput,
): Promise<ShareDto> {
	const shareId = parseId(id);
	const { count } = await db().share.updateMany({
		where: { id: shareId, ownerId: viewer.id },
		data: { access: input.access },
	});
	if (count === 0) {
		throw notFound("Share not found");
	}
	return toShareDto(
		await db().share.findUniqueOrThrow({
			where: { id: shareId },
			include: shareInclude,
		}),
	);
}

export async function deleteShare(viewer: Viewer, id: string): Promise<void> {
	const { count } = await db().share.deleteMany({
		where: { id: parseId(id), ownerId: viewer.id },
	});
	if (count === 0) {
		throw notFound("Share not found");
	}
}
