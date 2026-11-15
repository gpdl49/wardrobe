/**
 * Garment attributes the vision model picks from closed lists. Each value is
 * written as an item tag exactly as listed, so the same feature always gets the
 * same tag ("v-neck", never "v neck" or "vneck") and the catalogue's tag filter
 * finds it. An attribute that does not apply to the item (a neckline on shoes)
 * or cannot be seen is null.
 *
 * Values are tags as they appear to the user: lower case, at most 64 characters.
 * "Regular" lengths are left out on purpose: a tag on nearly every item does not
 * help anyone find anything.
 */
export const GARMENT_ATTRIBUTES = {
	neckline: [
		"crew neck",
		"v-neck",
		"scoop neck",
		"boat neck",
		"square neck",
		"turtleneck",
		"mock neck",
		"cowl neck",
		"halter neck",
		"off-shoulder",
	],
	collar: [
		"point collar",
		"spread collar",
		"button-down collar",
		"mandarin collar",
		"polo collar",
		"shawl collar",
		"notch lapel",
		"peak lapel",
		"hooded",
	],
	sleeve: ["sleeveless", "short sleeve", "three-quarter sleeve", "long sleeve"],
	fit: ["slim fit", "regular fit", "relaxed fit", "oversized"],
	length: ["cropped", "longline", "mini", "midi", "maxi"],
	closure: [
		"button front",
		"zip front",
		"half zip",
		"pullover",
		"wrap",
		"lace-up",
		"slip-on",
		"buckle",
	],
} as const satisfies Record<string, readonly string[]>;

export type GarmentAttribute = keyof typeof GARMENT_ATTRIBUTES;

export const GARMENT_ATTRIBUTE_KEYS = Object.keys(
	GARMENT_ATTRIBUTES,
) as GarmentAttribute[];

const ATTRIBUTE_HINTS: Record<GarmentAttribute, string> = {
	neckline: "Neckline of a collarless top or dress",
	collar: "Collar, lapel or hood",
	sleeve: "Sleeve length",
	fit: "Cut of the garment",
	length: "Length, only when not the ordinary length for this kind of item",
	closure: "How it fastens or goes on",
};

/** The `attributes` property of the vision JSON schema (strict: every key required). */
export function attributesJsonSchema() {
	return {
		type: "object",
		additionalProperties: false,
		required: [...GARMENT_ATTRIBUTE_KEYS],
		properties: Object.fromEntries(
			GARMENT_ATTRIBUTE_KEYS.map((key) => [
				key,
				{
					type: ["string", "null"],
					enum: [...GARMENT_ATTRIBUTES[key], null],
					description: `${ATTRIBUTE_HINTS[key]}; null if it does not apply or cannot be seen`,
				},
			]),
		),
	} as const;
}

/**
 * The tags for a model's `attributes` object, in GARMENT_ATTRIBUTES order.
 * Values outside the lists are dropped rather than failing the analysis: a
 * provider that ignores the enum should cost a tag, not the whole result.
 */
export function attributeTags(attributes: unknown): string[] {
	if (!attributes || typeof attributes !== "object") return [];
	const record = attributes as Record<string, unknown>;
	return GARMENT_ATTRIBUTE_KEYS.flatMap((key) => {
		const value = record[key];
		return typeof value === "string" &&
			(GARMENT_ATTRIBUTES[key] as readonly string[]).includes(value)
			? [value]
			: [];
	});
}
