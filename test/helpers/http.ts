import type { User } from "@/lib/auth";

export const TEST_USER: User = {
	sub: "test-sub",
	email: "test@example.com",
	username: "tester",
	groups: ["wardrobe"],
};

/** The headers oauth2-proxy would send for this user. */
export function proxyHeaders(user: User = TEST_USER): Record<string, string> {
	return {
		"X-Forwarded-User": user.sub,
		...(user.email ? { "X-Forwarded-Email": user.email } : {}),
		...(user.username
			? { "X-Forwarded-Preferred-Username": user.username }
			: {}),
		"X-Forwarded-Groups": user.groups.join(","),
	};
}

type RequestOptions = {
	method?: string;
	/** Serialised as JSON unless it is already a string. */
	body?: unknown;
	/** `null` sends no auth headers at all. */
	user?: User | null;
	headers?: Record<string, string>;
};

/** A Request as a route handler would receive it behind oauth2-proxy. */
export function apiRequest(
	path: string,
	options: RequestOptions = {},
): Request {
	const { method = "GET", body, user = TEST_USER, headers = {} } = options;
	return new Request(new URL(path, "http://127.0.0.1:3000"), {
		method,
		headers: {
			...(user ? proxyHeaders(user) : {}),
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
			...headers,
		},
		body:
			body === undefined
				? undefined
				: typeof body === "string"
					? body
					: JSON.stringify(body),
	});
}

/** Route context for handlers with dynamic segments. */
export const routeParams = <P extends Record<string, string>>(params: P) => ({
	params: Promise.resolve(params),
});

export async function json<T = unknown>(response: Response): Promise<T> {
	return (await response.json()) as T;
}
