import { describe, expect, it, vi } from "vitest";
import {
	OPENROUTER_URL,
	OpenRouterError,
	structuredCompletion,
} from "@/lib/analyses/openrouter";

const messages = [
	{ role: "system" as const, content: "Describe." },
	{
		role: "user" as const,
		content: [
			{ type: "text" as const, text: "Photo 1 (main):" },
			{
				type: "image_url" as const,
				image_url: { url: "data:image/jpeg;base64,AAAA" },
			},
		],
	},
];

const schema = { type: "object", properties: {} };

function mockFetch(status: number, body: unknown) {
	return vi.fn<typeof fetch>(
		async () =>
			new Response(typeof body === "string" ? body : JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
	);
}

const call = (fetchImpl: typeof fetch) =>
	structuredCompletion({
		apiKey: "sk-or-test",
		model: "google/gemini-3.1-flash-lite",
		messages,
		schemaName: "item_suggestion",
		schema,
		fetch: fetchImpl,
	});

describe("structuredCompletion", () => {
	it("sends the model, a strict json_schema response format and image parts", async () => {
		const fetchImpl = mockFetch(200, {
			model: "google/gemini-3.1-flash-lite",
			choices: [{ message: { content: '{"name":"x"}' } }],
			usage: { prompt_tokens: 900, completion_tokens: 40 },
		});
		const result = await call(fetchImpl);
		expect(result).toEqual({
			model: "google/gemini-3.1-flash-lite",
			content: '{"name":"x"}',
			usage: { prompt_tokens: 900, completion_tokens: 40 },
		});

		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe(OPENROUTER_URL);
		expect(init?.method).toBe("POST");
		expect(init?.headers).toMatchObject({
			Authorization: "Bearer sk-or-test",
			"Content-Type": "application/json",
		});
		const body = JSON.parse(init?.body as string);
		expect(body).toMatchObject({
			model: "google/gemini-3.1-flash-lite",
			response_format: {
				type: "json_schema",
				json_schema: { name: "item_suggestion", strict: true, schema },
			},
			provider: { require_parameters: true },
			temperature: 0,
			max_tokens: 1000,
		});
		expect(body.messages[1].content[1]).toEqual({
			type: "image_url",
			image_url: { url: "data:image/jpeg;base64,AAAA" },
		});
	});

	it("throws OpenRouterError with the API's message on HTTP errors", async () => {
		const err = await call(
			mockFetch(402, { error: { message: "Key limit exceeded", code: 402 } }),
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(OpenRouterError);
		expect((err as OpenRouterError).status).toBe(402);
		expect((err as Error).message).toBe("OpenRouter 402: Key limit exceeded");
	});

	it("throws on a non-JSON error body", async () => {
		await expect(call(mockFetch(502, "<html>bad gateway"))).rejects.toThrow(
			/OpenRouter 502/,
		);
	});

	it("throws on provider errors, refusals and empty content", async () => {
		await expect(
			call(
				mockFetch(200, { choices: [{ error: { message: "upstream down" } }] }),
			),
		).rejects.toThrow("OpenRouter: upstream down");
		await expect(
			call(
				mockFetch(200, {
					choices: [{ message: { content: null, refusal: "no" } }],
				}),
			),
		).rejects.toThrow("Model refused: no");
		await expect(
			call(
				mockFetch(200, {
					choices: [{ message: { content: "" }, finish_reason: "length" }],
				}),
			),
		).rejects.toThrow(/no content \(finish_reason length\)/);
	});
});
