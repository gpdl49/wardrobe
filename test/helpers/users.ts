import { type AccessContext, loadAccess } from "@/lib/access";
import { ensureUserRow, type User } from "@/lib/auth";
import { db } from "@/lib/db";
import { TEST_USER } from "@/test/helpers/http";

/** A second and third signed-in user, and a category admin. */
export const OTHER_USER: User = {
	sub: "other-sub",
	email: "other@example.com",
	username: "other",
	groups: ["wardrobe"],
};
export const THIRD_USER: User = {
	sub: "third-sub",
	email: "third@example.com",
	username: "third",
	groups: ["wardrobe"],
};
export const ADMIN_USER: User = {
	sub: "admin-sub",
	email: "admin@example.com",
	username: "admin",
	groups: ["wardrobe", "wardrobe-admin"],
};

/** The user's id, creating the row as signing in would. */
export const userId = (user: User = TEST_USER): Promise<string> =>
	ensureUserRow(user);

/** `owner` shares a location (or their whole wardrobe) with `grantee`. */
export async function share(
	owner: User,
	grantee: User,
	access: "view" | "edit",
	locationId: string | null = null,
) {
	return db().share.create({
		data: {
			ownerId: await userId(owner),
			granteeId: await userId(grantee),
			access,
			locationId,
		},
	});
}

/** Tests calling services directly: the context a route would load. */
export async function accessFor(
	user: User = TEST_USER,
): Promise<AccessContext> {
	return loadAccess({ id: await userId(user) });
}
