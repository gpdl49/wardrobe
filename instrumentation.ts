/**
 * Runs once when the Next.js server starts. Starts the pg-boss worker in this
 * process (docs/wardrobe.md: background jobs run in-process).
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}
	const { env } = await import("@/lib/env");
	// Fail fast on a bad environment instead of on the first request.
	const config = env();
	if (!config.JOBS_ENABLED) {
		return;
	}
	const { startWorker } = await import("@/lib/jobs/worker");
	try {
		await startWorker();
	} catch (err) {
		// The web app still serves; jobs stay queued until a restart.
		console.error("[jobs] worker failed to start", err);
	}
}
