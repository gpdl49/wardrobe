import {
	accessToOutfit,
	loadAccess,
	requireEdit,
	requireRead,
} from "@/lib/access";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { env, immichEnabled } from "@/lib/env";
import { ApiError, notFound, unprocessable } from "@/lib/http/errors";
import { type ImmichAsset, ImmichClient, ImmichError } from "./client";
import { decryptKey, encryptKey } from "./crypto";

function config() {
	const e = env();
	if (!immichEnabled(e))
		throw new ApiError(409, "Immich is disabled", "immich_disabled");
	return { url: e.IMMICH_URL as string, secret: e.SECRETS_KEY as string };
}
function unavailable(): never {
	throw new ApiError(502 as 500, "Immich is unavailable", "immich_unavailable");
}
async function call<T>(fn: () => Promise<T>, rejected = false): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ImmichError && e.status === 404)
			throw notFound("Asset not found");
		if (
			rejected &&
			e instanceof ImmichError &&
			(e.status === 401 || e.status === 403)
		)
			throw new ApiError(422, "Immich key rejected", "immich_key_rejected");
		return unavailable();
	}
}
async function client(userId: string) {
	const { url, secret } = config();
	const connection = await db().immichConnection.findUnique({
		where: { userId },
	});
	if (!connection)
		throw new ApiError(409, "Immich is not connected", "immich_not_connected");
	try {
		return {
			api: new ImmichClient(url, decryptKey(connection.apiKey, secret)),
			ownerId: connection.immichUserId,
		};
	} catch {
		return unavailable();
	}
}
export async function status(viewer: Viewer) {
	const { url } = config();
	const c = await db().immichConnection.findUnique({
		where: { userId: viewer.id },
	});
	return {
		enabled: true,
		connected: !!c,
		url,
		user: c
			? { id: c.immichUserId, email: c.immichEmail, name: c.immichName }
			: null,
	};
}
export async function connect(viewer: Viewer, key: string) {
	const { url, secret } = config();
	const user = await call(() => new ImmichClient(url, key).user(), true);
	await db().immichConnection.upsert({
		where: { userId: viewer.id },
		create: {
			userId: viewer.id,
			apiKey: encryptKey(key, secret),
			immichUserId: user.id,
			immichEmail: user.email,
			immichName: user.name,
		},
		update: {
			apiKey: encryptKey(key, secret),
			immichUserId: user.id,
			immichEmail: user.email,
			immichName: user.name,
		},
	});
	return status(viewer);
}
export async function disconnect(viewer: Viewer) {
	config();
	await db().immichConnection.deleteMany({ where: { userId: viewer.id } });
}
function dto(a: ImmichAsset) {
	return {
		id: a.id,
		fileName: a.originalFileName ?? null,
		width: a.width ?? null,
		height: a.height ?? null,
		thumbhash: a.thumbhash ?? null,
		takenAt: a.fileCreatedAt ?? null,
		thumbUrl: `/api/immich/assets/${a.id}/thumb`,
	};
}
export async function search(
	viewer: Viewer,
	query: { q?: string; cursor?: string; limit: number },
) {
	const c = await client(viewer.id);
	const r = await call(() =>
		c.api.search(query.q, Number(query.cursor ?? 1), query.limit),
	);
	return {
		assets: r.assets.items.filter((a) => a.ownerId === c.ownerId).map(dto),
		nextCursor: r.assets.nextPage,
	};
}
export async function pickerThumb(viewer: Viewer, id: string) {
	const c = await client(viewer.id);
	const asset = await call(() => c.api.asset(id));
	if (asset.ownerId !== c.ownerId || asset.type !== "IMAGE")
		throw notFound("Asset not found");
	return stream(await call(() => c.api.image(id, "thumb")));
}
function stream(response: Response, cache = false) {
	const headers = new Headers();
	for (const name of ["content-type", "content-length"]) {
		const value = response.headers.get(name);
		if (value) headers.set(name, value);
	}
	if (cache) headers.set("cache-control", "private, max-age=300");
	return new Response(response.body, { headers });
}
async function outfit(viewer: Viewer, id: string, edit: boolean) {
	config();
	const row = await db().outfit.findUnique({
		where: { id },
		select: { id: true, ownerId: true },
	});
	if (!row) throw notFound("Outfit not found");
	const access = accessToOutfit(await loadAccess(viewer), row);
	if (edit) requireEdit(access, "Outfit");
	else requireRead(access, "Outfit");
}
function photo(row: {
	id: string;
	outfitId: string;
	assetId: string;
	width: number | null;
	height: number | null;
	thumbhash: string | null;
	takenAt: Date | null;
	createdAt: Date;
}) {
	const base = `/api/outfits/${row.outfitId}/immich-assets/${row.id}`;
	return {
		id: row.id,
		source: "immich" as const,
		status: "ready" as const,
		width: row.width,
		height: row.height,
		blurhash: null,
		thumbhash: row.thumbhash,
		assetId: row.assetId,
		takenAt: row.takenAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		urls: { thumb: `${base}/thumb`, display: `${base}/display` },
	};
}
export async function link(viewer: Viewer, id: string, ids: string[]) {
	await outfit(viewer, id, true);
	const c = await client(viewer.id);
	const rows = [];
	for (const assetId of ids) {
		let row = await db().outfitImmichAsset.findUnique({
			where: { outfitId_assetId: { outfitId: id, assetId } },
		});
		if (!row) {
			let a: ImmichAsset;
			try {
				a = await call(() => c.api.asset(assetId));
			} catch (e) {
				if (e instanceof ApiError && e.status === 404)
					throw unprocessable("Asset is not readable");
				throw e;
			}
			if (a.ownerId !== c.ownerId || a.type !== "IMAGE")
				throw unprocessable("Asset must be an image");
			row = await db().outfitImmichAsset.upsert({
				where: { outfitId_assetId: { outfitId: id, assetId } },
				create: {
					outfitId: id,
					linkedById: viewer.id,
					assetId,
					fileName: a.originalFileName,
					width: a.width,
					height: a.height,
					thumbhash: a.thumbhash,
					takenAt: a.fileCreatedAt ? new Date(a.fileCreatedAt) : null,
				},
				update: {},
			});
		}
		rows.push(photo(row));
	}
	return rows;
}
export async function unlink(viewer: Viewer, id: string, linkId: string) {
	await outfit(viewer, id, true);
	const result = await db().outfitImmichAsset.deleteMany({
		where: { id: linkId, outfitId: id },
	});
	if (!result.count) throw notFound("Link not found");
}
export async function variant(
	viewer: Viewer,
	id: string,
	linkId: string,
	size: "thumb" | "display",
) {
	await outfit(viewer, id, false);
	const row = await db().outfitImmichAsset.findFirst({
		where: { id: linkId, outfitId: id },
	});
	if (!row) throw notFound("Link not found");
	let c: Awaited<ReturnType<typeof client>>;
	try {
		c = await client(row.linkedById);
	} catch (e) {
		if (e instanceof ApiError && e.code === "immich_not_connected")
			throw notFound("Asset not found");
		throw e;
	}
	return stream(await call(() => c.api.image(row.assetId, size)), true);
}
