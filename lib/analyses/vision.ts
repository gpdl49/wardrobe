import { z } from "zod";
import { itemSuggestionSchema, LIMITS, SEASONS } from "@/lib/analyses/schema";
import type { ItemSuggestion } from "@/lib/api/types";
import { formatZodError } from "@/lib/http/errors";

/**
 * The vision analysis prompt, its JSON-schema response format and the
 * validation of what comes back. Pure; the job (lib/analyses/jobs.ts) does
 * the I/O. Colours are not asked for: the local colour analysis does those.
 */

export type VisionCategory = { slug: string; name: string; path: string };

export type VisionImage = {
	kind: "main" | "label";
	/** data: URL (or any URL the provider can fetch). */
	url: string;
};

/** Fields the model fills; every key is required, null when unknown. */
const VISION_FIELDS = [
	"name",
	"categorySlug",
	"brand",
	"size",
	"pattern",
	"material",
	"seasons",
	"tags",
	"labelText",
] as const;

const nullableString = (description: string) => ({
	type: ["string", "null"],
	description,
});

/** JSON schema for `response_format` (strict: all keys required, no extras). */
export function visionJsonSchema(categorySlugs: readonly string[]) {
	return {
		type: "object",
		additionalProperties: false,
		required: [...VISION_FIELDS],
		properties: {
			name: nullableString(
				"Short catalogue name, 2-6 words, e.g. 'Navy merino crew-neck jumper'",
			),
			categorySlug: {
				type: ["string", "null"],
				enum: [...categorySlugs, null],
				description: "The most specific matching category slug, or null",
			},
			brand: nullableString("Brand as printed on a label, or null"),
			size: nullableString("Size as printed on a label (e.g. 'M', 'EU 42')"),
			pattern: nullableString(
				"One or two words: solid, striped, checked, floral, printed...",
			),
			material: nullableString(
				"Main fabric, from the care label when visible (e.g. '100% cotton')",
			),
			seasons: {
				type: "array",
				items: { type: "string", enum: [...SEASONS] },
				description: "Seasons the garment suits",
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: `Up to ${LIMITS.tags} short lower-case descriptors (fit, style, occasion)`,
			},
			labelText: nullableString(
				"Verbatim text read from care or brand labels, or null",
			),
		},
	} as const;
}

export const VISION_SCHEMA_NAME = "item_suggestion";

const SYSTEM_PROMPT = `You catalogue clothes from photos for a personal wardrobe app.
You get photos of ONE garment or accessory: "main" photos show the whole item, "label" photos show its care or brand labels.
Return only facts you can see. Use null (or an empty array) for anything you cannot determine; never guess a brand or size.
- name: a short, specific catalogue name in English, sentence case, without the brand.
- categorySlug: exactly one slug from the category list, the most specific that fits, or null.
- pattern and material: lower case. Prefer the care label's composition for material.
- seasons: the seasons the item would normally be worn in.
- tags: lower-case descriptors useful for search (e.g. "crew neck", "slim fit", "formal"), no colours, at most ${LIMITS.tags}.
- labelText: transcribe the label text (brand, size, composition, care instructions), lines separated by newlines; null if there is no label photo.`;

/** OpenRouter chat completion body (without `model`). */
export function buildVisionMessages(
	categories: readonly VisionCategory[],
	images: readonly VisionImage[],
) {
	const categoryList = categories.map((c) => `${c.slug}: ${c.path}`).join("\n");
	return [
		{ role: "system" as const, content: SYSTEM_PROMPT },
		{
			role: "user" as const,
			content: [
				{
					type: "text" as const,
					text: `Categories (slug: path):\n${categoryList}\n\nDescribe this item.`,
				},
				...images.flatMap((image, i) => [
					{
						type: "text" as const,
						text: `Photo ${i + 1} (${image.kind}):`,
					},
					{ type: "image_url" as const, image_url: { url: image.url } },
				]),
			],
		},
	];
}

const optionalText = (max: number) =>
	z
		.string()
		.nullish()
		.transform((v) => v?.trim() || undefined)
		.pipe(z.string().max(max).optional());

function modelOutputSchema(categorySlugs: readonly string[]) {
	const slugs = new Set(categorySlugs);
	return z
		.object({
			name: optionalText(LIMITS.name),
			categorySlug: optionalText(100).refine(
				(slug) => slug === undefined || slugs.has(slug),
				{ message: "not one of the existing category slugs" },
			),
			brand: optionalText(LIMITS.brand),
			size: optionalText(LIMITS.size),
			pattern: optionalText(LIMITS.pattern).transform((v) => v?.toLowerCase()),
			material: optionalText(LIMITS.material),
			seasons: z
				.array(z.enum(SEASONS))
				.nullish()
				.transform((v) => [...new Set(v ?? [])]),
			tags: z
				.array(z.string())
				.nullish()
				.transform((tags) => [
					...new Set(
						(tags ?? [])
							.map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
							.filter((t) => t.length > 0 && t.length <= LIMITS.tag),
					),
				])
				.pipe(z.array(z.string()).max(LIMITS.tags)),
			labelText: optionalText(LIMITS.labelText),
		})
		.strict();
}

export type VisionParseResult =
	| { ok: true; suggestion: ItemSuggestion; raw: unknown }
	| { ok: false; error: string; raw: unknown };

/** Some providers wrap JSON in a Markdown fence despite response_format. */
function stripFence(content: string): string {
	const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(content);
	return m?.[1] ?? content;
}

/** Validates the model's message content into an ItemSuggestion. */
export function parseVisionOutput(
	content: string,
	categorySlugs: readonly string[],
): VisionParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(stripFence(content));
	} catch {
		return { ok: false, error: "Model returned invalid JSON", raw: content };
	}
	const parsed = modelOutputSchema(categorySlugs).safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: `Model output failed validation: ${formatZodError(parsed.error)}`,
			raw,
		};
	}
	// Drop empty values: a suggestion only lists what the model found.
	const suggestion = Object.fromEntries(
		Object.entries(parsed.data).filter(
			([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
		),
	);
	return { ok: true, suggestion: itemSuggestionSchema.parse(suggestion), raw };
}
