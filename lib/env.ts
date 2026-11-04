import { z } from "zod";

/**
 * Runtime configuration. The variables are the contract in docs/wardrobe.md
 * ("App environment"). Parsed lazily on first use, never at import time, so
 * `next build` and /api/healthz work without any of them set.
 */

/** Kubernetes and compose often set unset values to "". Treat that as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
	z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const withDefault = <T extends z.ZodType>(schema: T, fallback: z.input<T>) =>
	z.preprocess((v) => (v === "" || v === undefined ? fallback : v), schema);

/**
 * OpenRouter vision model: GA, accepts images, supports strict JSON-schema
 * structured outputs and reads labels well, at $0.25/$1.50 per M tokens
 * (~$0.001 per analysis with 1-3 downscaled photos), far inside the
 * $5/month key limit. Cheaper alternatives with structured outputs:
 * google/gemini-2.5-flash-lite, qwen/qwen3.5-flash-02-23,
 * mistralai/mistral-small-3.2-24b-instruct; stronger: google/gemini-3.6-flash.
 */
export const DEFAULT_VISION_MODEL = "google/gemini-3.1-flash-lite";

const envSchema = z
	.object({
		NODE_ENV: withDefault(
			z.enum(["development", "test", "production"]),
			"development",
		),
		DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
		AUTH_MODE: withDefault(z.enum(["proxy", "dev"]), "proxy"),
		REQUIRED_GROUP: withDefault(z.string().min(1), "wardrobe"),
		ADMIN_GROUP: withDefault(z.string().min(1), "wardrobe-admin"),
		AWS_REGION: withDefault(z.string().min(1), "eu-central-1"),
		AWS_ACCESS_KEY_ID: optional(z.string()),
		AWS_SECRET_ACCESS_KEY: optional(z.string()),
		PHOTO_BUCKET: withDefault(z.string().min(1), "centerpoint-wardrobe-photos"),
		/** Set for MinIO in dev/tests; switches the S3 client to path-style. */
		S3_ENDPOINT: optional(z.url({ protocol: /^https?$/ })),
		OPENROUTER_API_KEY: optional(z.string()),
		OPENROUTER_VISION_MODEL: withDefault(
			z.string().min(1),
			DEFAULT_VISION_MODEL,
		),
		/** Not in the contract: "false" keeps the pg-boss worker from starting. */
		JOBS_ENABLED: withDefault(
			z.enum(["true", "false"]).transform((v) => v === "true"),
			"true",
		),
	})
	.superRefine((env, ctx) => {
		if (env.AUTH_MODE === "dev" && env.NODE_ENV === "production") {
			ctx.addIssue({
				code: "custom",
				path: ["AUTH_MODE"],
				message: "AUTH_MODE=dev is refused when NODE_ENV=production",
			});
		}
		if (Boolean(env.AWS_ACCESS_KEY_ID) !== Boolean(env.AWS_SECRET_ACCESS_KEY)) {
			ctx.addIssue({
				code: "custom",
				path: ["AWS_ACCESS_KEY_ID"],
				message:
					"set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither",
			});
		}
	});

export type Env = z.output<typeof envSchema>;

export class EnvError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid environment:\n  ${issues.join("\n  ")}`);
		this.name = "EnvError";
	}
}

/** Pure: validate an environment record. Throws EnvError listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
	const result = envSchema.safeParse(source);
	if (!result.success) {
		throw new EnvError(
			result.error.issues.map(
				(issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
			),
		);
	}
	return result.data;
}

let cached: Env | undefined;

/** The validated process environment, parsed once. */
export function env(): Env {
	cached ??= parseEnv(process.env);
	return cached;
}

/** Tests only: forget the cached environment after changing process.env. */
export function resetEnvCache(): void {
	cached = undefined;
}

/** Whether vision analysis can run (OPENROUTER_API_KEY is set). */
export function analysisEnabled(e: Env = env()): boolean {
	return Boolean(e.OPENROUTER_API_KEY);
}
