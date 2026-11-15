import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { userId } from "@/test/helpers/users";
export async function makeOutfit(
	data: Partial<Prisma.OutfitUncheckedCreateInput> = {},
) {
	return db().outfit.create({
		data: {
			ownerId: data.ownerId ?? (await userId()),
			name: "Test outfit",
			...data,
		},
	});
}
export async function shareOutfit(outfitId: string, granteeId: string) {
	return db().outfitShare.create({ data: { outfitId, granteeId } });
}
