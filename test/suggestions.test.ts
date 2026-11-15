import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as dismiss } from "@/app/api/outfit-suggestions/[id]/dismiss/route";
import { POST } from "@/app/api/suggestion-runs/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { runSuggestions } from "@/lib/suggestions/run";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams } from "@/test/helpers/http";
import { userId } from "@/test/helpers/users";

vi.mock("@/lib/jobs/queue", () => ({ enqueue: vi.fn(async () => "job") }));
describeWithDb("suggestion runs", () => {
	beforeEach(async () => {
		await resetDb();
		process.env.OPENROUTER_API_KEY = "test-key";
		resetEnvCache();
	});
	afterEach(() => {
		delete process.env.OPENROUTER_API_KEY;
		resetEnvCache();
	});
	it("queues idempotently, calls the model once and presents and dismisses the result", async () => {
		const items = await Promise.all(
			Array.from({ length: 4 }, () => makeItem()),
		);
		const first = items[0];
		const second = items[1];
		if (!first || !second) throw new Error("missing fixtures");
		const req = () =>
			apiRequest("/api/suggestion-runs", {
				method: "POST",
				body: { itemIds: [first.id] },
				headers: { "Idempotency-Key": "run-key" },
			});
		const response = await POST(req(), undefined);
		expect(response.status).toBe(202);
		const run = await json<{ id: string }>(response);
		expect((await json<{ id: string }>(await POST(req(), undefined))).id).toBe(
			run.id,
		);
		const fakeFetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						model: "fake",
						choices: [
							{
								message: {
									content: JSON.stringify({
										suggestions: [
											{
												name: "Look",
												rationale: "It works.",
												itemIds: [first.id, second.id],
											},
										],
									}),
								},
							},
						],
					}),
					{ status: 200 },
				),
		);
		await runSuggestions(run.id, { fetch: fakeFetch });
		await runSuggestions(run.id, { fetch: fakeFetch });
		expect(fakeFetch).toHaveBeenCalledTimes(1);
		const saved = await db().suggestionRun.findUniqueOrThrow({
			where: { id: run.id },
			include: { suggestions: true },
		});
		expect(saved.status).toBe("done");
		const suggestion = saved.suggestions[0];
		if (!suggestion) throw new Error("missing suggestion");
		const dismissed = await dismiss(
			apiRequest("/dismiss", { method: "POST" }),
			routeParams({ id: suggestion.id }),
		);
		expect(dismissed.status).toBe(200);
		expect((await json<{ feedback: string }>(dismissed)).feedback).toBe(
			"dismissed",
		);
	});
	it("records invalid model output as failure", async () => {
		const ownerId = await userId();
		await Promise.all(Array.from({ length: 4 }, () => makeItem()));
		const row = await db().suggestionRun.create({
			data: { ownerId, requestedById: ownerId, request: {} },
		});
		await runSuggestions(row.id, {
			fetch: async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: '{"suggestions":[]}' } }],
					}),
				),
		});
		expect(
			(await db().suggestionRun.findUniqueOrThrow({ where: { id: row.id } }))
				.status,
		).toBe("failed");
	});
});

it("validator drops malformed and duplicate proposals", async () => {
	const { parseSuggestionOutput } = await import("@/lib/suggestions/prompt");
	const output = JSON.stringify({
		suggestions: [
			{ name: "", rationale: "x", itemIds: ["a", "b"] },
			{ name: "x", rationale: "x", itemIds: ["a", "a"] },
		],
	});
	expect(parseSuggestionOutput(output, ["a", "b"], ["a"]).ok).toBe(false);
});
