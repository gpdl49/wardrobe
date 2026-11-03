import { type Env, env } from "@/lib/env";
import { forbidden, unauthorized } from "@/lib/http/errors";

/**
 * Authentication. In production oauth2-proxy runs as a sidecar in front of the
 * app (which listens on 127.0.0.1 only) and passes the signed-in user as
 * headers; see docs/wardrobe.md "Authentication". The app trusts them and
 * checks REQUIRED_GROUP again as defence in depth.
 */
export type User = {
	/** Zitadel subject (X-Forwarded-User). */
	sub: string;
	email: string | null;
	username: string | null;
	groups: string[];
};

export const HEADER_USER = "x-forwarded-user";
export const HEADER_EMAIL = "x-forwarded-email";
export const HEADER_USERNAME = "x-forwarded-preferred-username";
export const HEADER_GROUPS = "x-forwarded-groups";

/** The fixed user every request runs as with AUTH_MODE=dev. */
export function devUser(requiredGroup: string): User {
	return {
		sub: "dev",
		email: "dev@localhost",
		username: "dev",
		groups: [requiredGroup],
	};
}

/** Comma-separated groups; oauth2-proxy may also repeat the header. */
export function parseGroups(value: string | null): string[] {
	if (!value) {
		return [];
	}
	return [
		...new Set(
			value
				.split(",")
				.map((g) => g.trim())
				.filter(Boolean),
		),
	];
}

const nonEmpty = (value: string | null) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

/** Pure: the user oauth2-proxy says this is, or null without X-Forwarded-User. */
export function parseProxyHeaders(headers: Headers): User | null {
	const sub = nonEmpty(headers.get(HEADER_USER));
	if (!sub) {
		return null;
	}
	return {
		sub,
		email: nonEmpty(headers.get(HEADER_EMAIL)),
		username: nonEmpty(headers.get(HEADER_USERNAME)),
		groups: parseGroups(headers.get(HEADER_GROUPS)),
	};
}

type AuthConfig = Pick<Env, "AUTH_MODE" | "REQUIRED_GROUP" | "NODE_ENV">;

/**
 * Pure: resolve the user for a request or throw an ApiError (401 without a
 * user, 403 without REQUIRED_GROUP).
 */
export function authenticate(headers: Headers, config: AuthConfig): User {
	if (config.AUTH_MODE === "dev") {
		// lib/env refuses this combination too; checked again so a bad config
		// can never become an open door.
		if (config.NODE_ENV === "production") {
			throw new Error("AUTH_MODE=dev is refused when NODE_ENV=production");
		}
		return devUser(config.REQUIRED_GROUP);
	}
	const user = parseProxyHeaders(headers);
	if (!user) {
		throw unauthorized();
	}
	if (!user.groups.includes(config.REQUIRED_GROUP)) {
		throw forbidden(`Requires the ${config.REQUIRED_GROUP} group`);
	}
	return user;
}

/** The signed-in user for this request, per the process environment. */
export function requireUser(request: Request | { headers: Headers }): User {
	return authenticate(request.headers, env());
}
