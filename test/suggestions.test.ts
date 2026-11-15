import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as dismiss } from "@/app/api/outfit-suggestions/[id]/dismiss/route";
import { POST } from "@/app/api/suggestion-runs/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { suggestionRun } from "@/lib/jobs/definitions/suggestion-run";
import { jobDefinitions } from "@/lib/jobs/registry";
import { DEFAULT_TEXT_MODEL } from "@/lib/suggestions/prompt";
import { runSuggestions } from "@/lib/suggestions/run";
import { describeWithDb, resetDb } from "@/test/helpers/db";
import { makeItem } from "@/test/helpers/fixtures";
import { apiRequest, json, routeParams, TEST_USER } from "@/test/helpers/http";
import { OTHER_USER, share, userId } from "@/test/helpers/users";

vi.mock("@/lib/jobs/queue", () => ({ enqueue: vi.fn(async () => "job") }));
describeWithDb("suggestion runs", () => {
	it("registers the suggestion job without retries", () => {
		expect(jobDefinitions).toContain(suggestionRun);
		expect(suggestionRun.queue?.retryLimit).toBe(0);
	});
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
	it("enforces creation constraints and idempotent dismissal", async () => {
		const post = (body: unknown) =>
			POST(
				apiRequest("/api/suggestion-runs", { method: "POST", body }),
				undefined,
			);
		expect((await post({})).status).toBe(409);
		const items = await Promise.all(
			Array.from({ length: 4 }, () => makeItem()),
		);
		expect((await post({ prompt: "x".repeat(501) })).status).toBe(400);
		expect((await post({ count: 7 })).status).toBe(400);
		expect((await post({ itemIds: [crypto.randomUUID()] })).status).toBe(422);
		const run = await json<{ id: string }>(
			await post({ itemIds: [items[0]?.id] }),
		);
		const row = await db().outfitSuggestion.create({
			data: {
				runId: run.id,
				ownerId: await userId(),
				position: 0,
				name: "Look",
				itemIds: [],
			},
		});
		const req = () => apiRequest("/", { method: "POST" });
		expect((await dismiss(req(), routeParams({ id: row.id }))).status).toBe(
			200,
		);
		expect((await dismiss(req(), routeParams({ id: row.id }))).status).toBe(
			200,
		);
		await db().outfitSuggestion.update({
			where: { id: row.id },
			data: { feedback: "saved" },
		});
		expect((await dismiss(req(), routeParams({ id: row.id }))).status).toBe(
			409,
		);
		delete process.env.OPENROUTER_API_KEY;
		resetEnvCache();
		expect((await post({})).status).toBe(409);
	});
	it("does not replay a run after edit access is revoked", async () => {
		const ownerId = await userId();
		await Promise.all(Array.from({ length: 4 }, () => makeItem()));
		const grant = await share(TEST_USER, OTHER_USER, "edit");
		const req = () =>
			apiRequest("/api/suggestion-runs", {
				method: "POST",
				user: OTHER_USER,
				headers: { "Idempotency-Key": "revoked-run" },
				body: { ownerId },
			});
		expect((await POST(req(), undefined)).status).toBe(202);
		await db().share.delete({ where: { id: grant.id } });
		expect((await POST(req(), undefined)).status).toBe(404);
	});
	it("sends at most 400 items with required items first and drops invalid proposals", async () => {
		const ownerId = await userId();
		const required = await makeItem({ name: "Required" });
		await db().item.createMany({
			data: Array.from({ length: 400 }, (_, i) => ({
				ownerId,
				name: `Item ${i}`,
			})),
		});
		const run = await db().suggestionRun.create({
			data: {
				ownerId,
				requestedById: ownerId,
				request: { itemIds: [required.id] },
			},
		});
		const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
			const body = JSON.parse(init?.body as string);
			expect(body.model).toBe(DEFAULT_TEXT_MODEL);
			expect(body).not.toHaveProperty("temperature");
			const data = JSON.parse(body.messages[1].content);
			expect(data.items).toHaveLength(400);
			expect(data.items[0].id).toBe(required.id);
			expect(body.response_format.json_schema.strict).toBe(true);
			return Response.json({
				choices: [
					{
						message: {
							content: JSON.stringify({
								suggestions: [
									{
										name: "Missing required",
										rationale: "x",
										itemIds: [data.items[1].id, data.items[2].id],
									},
									{
										name: "Unknown",
										rationale: "x",
										itemIds: [required.id, "unknown"],
									},
									{
										name: "Valid",
										rationale: "x",
										itemIds: [required.id, data.items[1].id],
									},
								],
							}),
						},
					},
				],
			});
		});
		await runSuggestions(run.id, { fetch: fetcher });
		const result = await db().suggestionRun.findUniqueOrThrow({
			where: { id: run.id },
			include: { suggestions: true },
		});
		expect(result.status).toBe("done");
		expect(result.suggestions.map((s) => s.name)).toEqual(["Valid"]);
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
