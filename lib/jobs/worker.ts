import { getBoss } from "@/lib/jobs/queue";
import { jobDefinitions } from "@/lib/jobs/registry";

/**
 * Starts the in-process worker: creates each registered queue (idempotent)
 * and works it. Called once from instrumentation.ts at server start.
 */
export async function startWorker(): Promise<void> {
	const boss = await getBoss();
	for (const definition of jobDefinitions) {
		await boss.createQueue(definition.name, definition.queue);
		if (definition.queue) {
			await boss.updateQueue(definition.name, definition.queue);
		}
		await boss.work(definition.name, { batchSize: 1 }, async ([job]) => {
			if (!job) {
				return;
			}
			const data = definition.schema.parse(job.data);
			await definition.handler(data, job);
		});
	}
	console.info(
		`[jobs] worker started: ${jobDefinitions.map((d) => d.name).join(", ")}`,
	);
}
