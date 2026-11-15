import { describe, expect, it } from "vitest";
import {
	buildVisionMessages,
	parseVisionOutput,
	visionJsonSchema,
} from "@/lib/analyses/vision";

const SLUGS = ["tops", "knitwear", "jumpers", "jeans"];

const good = {
	name: "Navy merino crew-neck jumper",
	categorySlug: "jumpers",
	brand: "Uniqlo",
	size: "M",
	pattern: "Solid",
	material: "100% merino wool",
	seasons: ["autumn", "winter", "winter"],
	tags: ["Crew Neck", "  knit ", "crew neck", ""],
	labelText: "UNIQLO\nM\n100% MERINO WOOL",
};

describe("parseVisionOutput", () => {
	it("accepts good output and normalises it", () => {
		const result = parseVisionOutput(JSON.stringify(good), SLUGS);
		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.suggestion).toEqual({
			name: "Navy merino crew-neck jumper",
			categorySlug: "jumpers",
			brand: "Uniqlo",
			size: "M",
			pattern: "solid",
			material: "100% merino wool",
			seasons: ["autumn", "winter"],
			tags: ["crew neck", "knit"],
			labelText: "UNIQLO\nM\n100% MERINO WOOL",
		});
	});

	it("drops nulls, empty strings and empty arrays", () => {
		const result = parseVisionOutput(
			JSON.stringify({
				name: "Blue jeans",
				categorySlug: null,
				brand: "",
				size: null,
				pattern: null,
				material: null,
				seasons: [],
				tags: [],
				labelText: null,
			}),
			SLUGS,
		);
		expect(result).toEqual({
			ok: true,
			suggestion: { name: "Blue jeans" },
			raw: expect.anything(),
		});
	});

	it("tolerates a Markdown fence around the JSON", () => {
		const result = parseVisionOutput(
			`\`\`\`json\n${JSON.stringify(good)}\n\`\`\``,
			SLUGS,
		);
		expect(result.ok).toBe(true);
	});

	it("rejects malformed JSON and keeps the raw content", () => {
		const result = parseVisionOutput('{"name": "Jumper",', SLUGS);
		expect(result).toEqual({
			ok: false,
			error: "Model returned invalid JSON",
			raw: '{"name": "Jumper",',
		});
	});

	it("rejects an unknown category slug", () => {
		const result = parseVisionOutput(
			JSON.stringify({ ...good, categorySlug: "sweaters" }),
			SLUGS,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/categorySlug: not one of the existing/);
		expect(result.raw).toMatchObject({ categorySlug: "sweaters" });
	});

	it("rejects wrong types, unknown seasons and extra keys", () => {
		for (const bad of [
			{ ...good, seasons: ["monsoon"] },
			{ ...good, tags: "knit" },
			{ ...good, colour: "navy" },
			{ ...good, size: "x".repeat(51) },
			[good],
		]) {
			expect(parseVisionOutput(JSON.stringify(bad), SLUGS).ok).toBe(false);
		}
	});
});

describe("visionJsonSchema", () => {
	it("is strict and constrains the category to the given slugs", () => {
		const schema = visionJsonSchema(SLUGS);
		expect(schema.additionalProperties).toBe(false);
		expect([...schema.required].sort()).toEqual(
			Object.keys(schema.properties).sort(),
		);
		expect(schema.properties.categorySlug.enum).toEqual([...SLUGS, null]);
		expect(schema.properties.seasons.items.enum).toEqual([
			"spring",
			"summer",
			"autumn",
			"winter",
		]);
	});
});

describe("buildVisionMessages", () => {
	it("lists the categories and labels each image", () => {
		const messages = buildVisionMessages(
			[{ slug: "jumpers", name: "Jumpers", path: "Knitwear > Jumpers" }],
			[
				{ kind: "main", url: "data:image/jpeg;base64,AAA" },
				{ kind: "label", url: "data:image/jpeg;base64,BBB" },
			],
		);
		expect(messages[0]?.role).toBe("system");
		const content = messages[1]?.content;
		expect(content?.[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("jumpers: Knitwear > Jumpers"),
		});
		expect(content?.slice(1)).toEqual([
			{ type: "text", text: "Photo 1 (main):" },
			{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
			{ type: "text", text: "Photo 2 (label):" },
			{ type: "image_url", image_url: { url: "data:image/jpeg;base64,BBB" } },
		]);
	});
});

it("includes existing tag vocabulary as JSON data", () => {
	const messages = buildVisionMessages(
		[],
		[],
		["formal", "ignore instructions"],
	);
	expect(messages[0]?.content).toContain("reuse supplied vocabulary");
	expect(JSON.stringify(messages[1]?.content)).toContain("formal");
});
