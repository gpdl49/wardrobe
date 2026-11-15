/**
 * Minimal OpenRouter chat-completions client (OpenAI-compatible API) for
 * structured vision output. No SDK: one POST, and fetch is injectable for
 * tests.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string | ContentPart[];
};

export type StructuredRequest = {
	apiKey: string;
	model: string;
	messages: ChatMessage[];
	schemaName: string;
	schema: object;
	/** Caps spend per call; the output is a small JSON object. */
	maxTokens?: number;
	/** Omit for models which do not support the temperature parameter. */
	omitTemperature?: boolean;
	timeoutMs?: number;
	fetch?: typeof fetch;
};

export type StructuredResponse = {
	/** The model that actually answered (OpenRouter may resolve aliases). */
	model: string;
	content: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

export class OpenRouterError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "OpenRouterError";
	}
}

type CompletionBody = {
	model?: string;
	choices?: {
		message?: { content?: string | null; refusal?: string | null };
		finish_reason?: string | null;
		error?: { message?: string };
	}[];
	error?: { message?: string; code?: number | string };
	usage?: StructuredResponse["usage"];
};

export async function structuredCompletion(
	request: StructuredRequest,
): Promise<StructuredResponse> {
	const doFetch = request.fetch ?? fetch;
	const response = await doFetch(OPENROUTER_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${request.apiKey}`,
			"Content-Type": "application/json",
			// OpenRouter app attribution.
			"HTTP-Referer": "https://wardrobe.vidur.xyz",
			"X-Title": "wardrobe",
		},
		body: JSON.stringify({
			model: request.model,
			messages: request.messages,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: request.schemaName,
					strict: true,
					schema: request.schema,
				},
			},
			// Only route to providers that honour response_format.
			provider: { require_parameters: true },
			...(request.omitTemperature ? {} : { temperature: 0 }),
			max_tokens: request.maxTokens ?? 1000,
		}),
		signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
	});

	let body: CompletionBody | undefined;
	try {
		body = (await response.json()) as CompletionBody;
	} catch {
		body = undefined;
	}
	if (!response.ok || body?.error) {
		const detail = body?.error?.message ?? response.statusText;
		throw new OpenRouterError(
			`OpenRouter ${response.status}: ${detail || "request failed"}`,
			response.status,
		);
	}
	const choice = body?.choices?.[0];
	if (choice?.error) {
		throw new OpenRouterError(
			`OpenRouter: ${choice.error.message ?? "provider error"}`,
		);
	}
	const message = choice?.message;
	if (message?.refusal) {
		throw new OpenRouterError(`Model refused: ${message.refusal}`);
	}
	if (!message?.content) {
		throw new OpenRouterError(
			`OpenRouter returned no content (finish_reason ${choice?.finish_reason ?? "unknown"})`,
		);
	}
	return {
		model: body?.model ?? request.model,
		content: message.content,
		usage: body?.usage,
	};
}
