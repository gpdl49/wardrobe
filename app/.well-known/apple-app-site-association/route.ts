import { buildAppleAppSiteAssociation } from "@/lib/apple/aasa";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Public route serving Apple App Site Association (AASA) for iOS universal links.
 * Returns 404 when IOS_APP_IDS is unset or empty.
 */
export function GET() {
	const appIds = env().IOS_APP_IDS;
	if (!appIds || appIds.length === 0) {
		return new Response(null, { status: 404 });
	}

	const body = buildAppleAppSiteAssociation(appIds);
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
