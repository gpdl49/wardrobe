import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireUser, type Viewer } from "@/lib/auth";
import { ApiError } from "@/lib/http/errors";
import { getLocationByCode } from "@/lib/locations/service";

/**
 * QR label target: https://wardrobe.vidur.xyz/l/<ownerId>/<code> -> that
 * location, never one in another wardrobe; without access it is a 404.
 * `?then=pack` / `?then=unpack` deep-link into packing or unpacking it; the
 * owner's own scan of an unknown code with `then=pack` offers to create it.
 */
export default async function LocationCodePage({
	params,
	searchParams,
}: PageProps<"/l/[ownerId]/[code]">) {
	const { ownerId, code: raw } = await params;
	const { then } = await searchParams;
	const code = decodeURIComponent(raw);
	let viewer: Viewer;
	try {
		viewer = await requireUser({ headers: await headers() });
	} catch (err) {
		// oauth2-proxy normally stops these first. Not signed in or not in the
		// required group is no access: a 404, like any other location.
		if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
			notFound();
		}
		throw err;
	}
	let id: string;
	try {
		({ id } = await getLocationByCode(viewer, code, ownerId));
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			if (then === "pack" && ownerId === viewer.id) {
				redirect(`/pack?code=${encodeURIComponent(code.toUpperCase())}`);
			}
			notFound();
		}
		throw err;
	}
	if (then === "pack" || then === "unpack") {
		redirect(`/${then}?location=${id}`);
	}
	redirect(`/locations/${id}`);
}
