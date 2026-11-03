import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Direct-to-database fixtures, for arranging state the API under test reads. */
let counter = 0;

export async function makeLocation(
	data: Partial<Prisma.LocationUncheckedCreateInput> = {},
) {
	counter++;
	return db().location.create({
		data: {
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
	return db().item.create({ data: { name: `Test item ${counter}`, ...data } });
}
