import "server-only";
import { PgBoss, type SendOptions } from "pg-boss";
import { env } from "@/lib/env";
import type { JobData, JobDefinition } from "@/lib/jobs/define";

/**
 * pg-boss on the app database (schema `pgboss`), one instance per process,
 * shared by the worker (lib/jobs/worker.ts) and enqueue().
 */
const globalForBoss = globalThis as unknown as {
	boss: Promise<PgBoss> | undefined;
	queues: Set<string> | undefined;
};

export function getBoss(): Promise<PgBoss> {
	globalForBoss.boss ??= (async () => {
		const boss = new PgBoss({ connectionString: env().DATABASE_URL, max: 4 });
		boss.on("error", (err) => console.error("[jobs] pg-boss error", err));
		await boss.start();
		return boss;
	})().catch((err) => {
		globalForBoss.boss = undefined;
		throw err;
	});
	return globalForBoss.boss;
}

/** Validates the payload and enqueues a job; returns the job id. */
export async function enqueue<J extends JobDefinition>(
	job: J,
	data: JobData<J>,
	options?: SendOptions,
): Promise<string | null> {
	const payload = job.schema.parse(data) as object;
	const boss = await getBoss();
	// pg-boss drops sends to a queue that does not exist yet. The worker
	// creates every queue at start, but with JOBS_ENABLED=false (or before
	// it has started) enqueue must create the queue itself; createQueue is
	// idempotent, so do it once per process.
	globalForBoss.queues ??= new Set();
	if (!globalForBoss.queues.has(job.name)) {
		await boss.createQueue(job.name, job.queue);
		globalForBoss.queues.add(job.name);
	}
	return boss.send(job.name, payload, options);
}

export async function stopBoss(): Promise<void> {
	const pending = globalForBoss.boss;
	globalForBoss.boss = undefined;
	globalForBoss.queues = undefined;
	await (await pending)?.stop({ graceful: true, timeout: 10_000 });
}
