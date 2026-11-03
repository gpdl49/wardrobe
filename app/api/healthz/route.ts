/** Liveness/readiness: no auth (oauth2-proxy skips it) and no database. */
export const dynamic = "force-dynamic";

export function GET() {
	return new Response("ok", {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
