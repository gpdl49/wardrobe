import { afterAll, expect, it, vi } from "vitest";
import { systemPing } from "@/lib/jobs/definitions/system-ping";
import { enqueue, stopBoss } from "@/lib/jobs/queue";
import { startWorker } from "@/lib/jobs/worker";
import { describeWithDb } from "@/test/helpers/db";

describeWithDb("job queue", () => {
	afterAll(async () => {
		await stopBoss();
	});

	it("rejects an invalid payload before enqueueing", async () => {
		await expect(
			enqueue(systemPing, { message: 1 } as unknown as { message: string }),
		).rejects.toThrow();
	});

	it("runs an enqueued job in the in-process worker", async () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		await startWorker();
		const id = await enqueue(systemPing, { message: "hello" });
		expect(id).toBeTruthy();
		await vi.waitFor(
			() =>
				expect(info).toHaveBeenCalledWith(`[jobs] system.ping ${id}: hello`),
			{ timeout: 15_000, interval: 200 },
		);
		info.mockRestore();
	}, 20_000);
});
