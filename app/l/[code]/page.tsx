import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/http/errors";
import { getLocationByCode } from "@/lib/locations/service";

/** QR label target: https://wardrobe.vidur.xyz/l/<code> -> the location. */
export default async function LocationCodePage({
	params,
}: PageProps<"/l/[code]">) {
	const { code } = await params;
	let id: string;
	try {
		({ id } = await getLocationByCode(decodeURIComponent(code)));
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			notFound();
		}
		throw err;
	}
	redirect(`/locations/${id}`);
}
