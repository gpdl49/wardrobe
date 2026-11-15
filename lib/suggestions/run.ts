import { structuredCompletion } from "@/lib/analyses/openrouter";
import type { SuggestionRequest } from "@/lib/api/types";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
	buildSuggestionMessages,
	DEFAULT_TEXT_MODEL,
	parseSuggestionOutput,
	SUGGESTION_SCHEMA_NAME,
	suggestionJsonSchema,
} from "./prompt";

export async function runSuggestions(
	id: string,
	deps: { fetch?: typeof fetch } = {},
) {
	const claimed = await db().suggestionRun.updateMany({
		where: { id, status: "queued" },
		data: { status: "running", error: null },
	});
	if (!claimed.count) return;
	try {
		const run = await db().suggestionRun.findUniqueOrThrow({ where: { id } });
		const request = run.request as SuggestionRequest;
		const required = request.itemIds ?? [];
		const [items, categories, outfits] = await Promise.all([
			db().item.findMany({
				where: { ownerId: run.ownerId, status: { in: ["active", "stored"] } },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				include: { tags: { include: { tag: true } } },
			}),
			db().category.findMany(),
			db().outfit.findMany({
				where: { ownerId: run.ownerId },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				take: 20,
				include: {
					items: { orderBy: { position: "asc" } },
					tags: { include: { tag: true } },
				},
			}),
		]);
		const byId = new Map(items.map((i) => [i.id, i]));
		const chosen = [
			...required.flatMap((itemId) => {
				const item = byId.get(itemId);
				return item ? [item] : [];
			}),
			...items.filter((item) => !required.includes(item.id)),
		].slice(0, 400);
		if (required.some((itemId) => !byId.has(itemId)))
			throw new Error("A required item is no longer available");
		const categoryMap = new Map(categories.map((c) => [c.id, c]));
		const path = (id: string | null) => {
			const names: string[] = [];
			const seen = new Set<string>();
			while (id && !seen.has(id)) {
				seen.add(id);
				const c = categoryMap.get(id);
				if (!c) break;
				names.unshift(c.name);
				id = c.parentId;
			}
			return names.length ? names.join(" > ") : null;
		};
		const metadata = chosen.map((i) => ({
			id: i.id,
			name: i.name ?? "",
			categoryPath: path(i.categoryId),
			colors: i.colors,
			pattern: i.pattern,
			material: i.material,
			seasons: i.seasons,
			tags: i.tags.map((t) => t.tag.name),
		}));
		const examples = outfits.map((o) => ({
			name: o.name,
			itemIds: o.items.map((i) => i.itemId),
			seasons: o.seasons,
			tags: o.tags.map((t) => t.tag.name),
		}));
		const config = env();
		if (!config.OPENROUTER_API_KEY)
			throw new Error("Suggestions are disabled: no OPENROUTER_API_KEY");
		const response = await structuredCompletion({
			apiKey: config.OPENROUTER_API_KEY,
			model: run.model ?? config.OPENROUTER_TEXT_MODEL ?? DEFAULT_TEXT_MODEL,
			messages: buildSuggestionMessages(metadata, examples, request),
			schemaName: SUGGESTION_SCHEMA_NAME,
			schema: suggestionJsonSchema,
			maxTokens: 2000,
			fetch: deps.fetch,
		});
		const parsed = parseSuggestionOutput(
			response.content,
			chosen.map((i) => i.id),
			required,
			request.count ?? 3,
		);
		if (!parsed.ok) throw new Error(parsed.error);
		await db().$transaction(async (tx) => {
			await tx.outfitSuggestion.createMany({
				data: parsed.suggestions.map((s, position) => ({
					...s,
					position,
					runId: id,
					ownerId: run.ownerId,
				})),
			});
			await tx.suggestionRun.updateMany({
				where: { id },
				data: { status: "done", model: response.model },
			});
		});
	} catch (err) {
		await db().suggestionRun.updateMany({
			where: { id },
			data: {
				status: "failed",
				error:
					`Suggestion generation failed: ${err instanceof Error ? err.message : String(err)}`.slice(
						0,
						2000,
					),
			},
		});
	}
}
