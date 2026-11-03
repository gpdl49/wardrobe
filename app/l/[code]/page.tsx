import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/http/errors";
import { getLocationByCode } from "@/lib/locations/service";

/**
 * QR label target: https://wardrobe.vidur.xyz/l/<code> -> the location.
 * `?then=pack` / `?then=unpack` deep-link into packing or unpacking it; an
 * unknown code with `then=pack` offers to create the location.
 */
export default async function LocationCodePage({
	params,
	searchParams,
}: PageProps<"/l/[code]">) {
	const { code: raw } = await params;
	const { then } = await searchParams;
	const code = decodeURIComponent(raw);
	let id: string;
	try {
		({ id } = await getLocationByCode(code));
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			if (then === "pack") {
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
