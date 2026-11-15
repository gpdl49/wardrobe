/** Immich v3.1 OpenAPI: GET /users/me (user.read); POST /search/metadata,
 * POST /search/smart, GET /assets/{id} (asset.read); GET
 * /assets/{id}/thumbnail?size=thumbnail|preview (asset.view).
 * https://github.com/immich-app/immich/blob/v3.1.0/open-api/immich-openapi-specs.json
 */
export type ImmichAsset = {
	id: string;
	ownerId: string;
	type: string;
	originalFileName: string;
	width: number | null;
	height: number | null;
	thumbhash: string | null;
	fileCreatedAt: string;
};
export type ImmichUser = { id: string; email: string; name: string };
export class ImmichError extends Error {
	constructor(readonly status: number) {
		super("Immich request failed");
	}
}
export class ImmichClient {
	constructor(
		private url: string,
		private key: string,
		private fetcher: typeof fetch = fetch,
	) {}
	private async request(path: string, body?: object): Promise<Response> {
		let response: Response;
		try {
			response = await this.fetcher(`${this.url}/api${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					"x-api-key": this.key,
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
				signal: AbortSignal.timeout(15000),
				redirect: "error",
			});
		} catch {
			throw new ImmichError(0);
		}
		if (!response.ok) throw new ImmichError(response.status);
		return response;
	}
	private async json<T>(path: string, body?: object): Promise<T> {
		try {
			return (await (await this.request(path, body)).json()) as T;
		} catch (e) {
			if (e instanceof ImmichError) throw e;
			throw new ImmichError(0);
		}
	}
	user() {
		return this.json<ImmichUser>("/users/me");
	}
	search(q: string | undefined, page: number, size: number) {
		return this.json<{
			assets: { items: ImmichAsset[]; nextPage: string | null };
		}>(q ? "/search/smart" : "/search/metadata", {
			type: "IMAGE",
			page,
			size,
			withExif: true,
			...(q ? { query: q } : { order: "desc" }),
		});
	}
	asset(id: string) {
		return this.json<ImmichAsset>(`/assets/${id}`);
	}
	image(id: string, variant: "thumb" | "display") {
		return this.request(
			`/assets/${id}/thumbnail?size=${variant === "thumb" ? "thumbnail" : "preview"}`,
		);
	}
}
