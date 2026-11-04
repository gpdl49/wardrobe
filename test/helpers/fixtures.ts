import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { userId } from "@/test/helpers/users";

/**
 * Direct-to-database fixtures, for arranging state the API under test reads.
 * Rows belong to TEST_USER unless `ownerId` is given.
 */
let counter = 0;

export async function makeLocation(
	data: Partial<Prisma.LocationUncheckedCreateInput> = {},
) {
	counter++;
	return db().location.create({
		data: {
			ownerId: data.ownerId ?? (await userId()),
			kind: "bag",
			code: `T-${counter}`,
			name: `Test location ${counter}`,
			...data,
		},
	});
}

export async function makeItem(
	data: Partial<Prisma.ItemUncheckedCreateInput> = {},
) {
	counter++;
	return db().item.create({
		data: {
			ownerId: data.ownerId ?? (await userId()),
			name: `Test item ${counter}`,
			...data,
		},
	});
}
