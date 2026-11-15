import { COLOR_ALGORITHM, extractColors } from "@/lib/analyses/colors";
import { loadPhotoBytes, toJpegDataUrl } from "@/lib/analyses/images";
import { structuredCompletion } from "@/lib/analyses/openrouter";
import {
	buildVisionMessages,
	parseVisionOutput,
	VISION_SCHEMA_NAME,
	type VisionCategory,
	type VisionImage,
	visionJsonSchema,
} from "@/lib/analyses/vision";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type {
	Analysis,
	AnalysisKind,
	Prisma,
} from "@/lib/generated/prisma/client";

/**
 * The analysis job bodies (lib/jobs/definitions/analysis-*.ts). Each claims a
 * queued Analysis row, does the work and records `done` with a result or
 * `failed` with an error. They never throw: a failed analysis is a visible
 * state the user can re-run, and automatic retries would spend the OpenRouter
 * budget on the same bad input.
 */

/** Photos sent per vision call: enough for the item and its labels. */
const MAX_MAIN_PHOTOS = 2;
const MAX_LABEL_PHOTOS = 2;
/** Long edge of images sent to the model; labels larger, for legibility. */
const MAIN_EDGE = 768;
const LABEL_EDGE = 1024;

/** queued -> running, atomically; null if gone or already handled. */
async function claim(id: string, kind: AnalysisKind): Promise<Analysis | null> {
	const { count } = await db().analysis.updateMany({
		where: { id, kind, status: "queued" },
		data: { status: "running", error: null },
	});
	return count === 1 ? db().analysis.findUnique({ where: { id } }) : null;
}

/** updateMany: the item (and so the analysis) may have been deleted meanwhile. */
async function finish(
	id: string,
	data: Prisma.AnalysisUpdateManyMutationInput,
): Promise<void> {
	await db().analysis.updateMany({ where: { id }, data });
}

const fail = (id: string, error: string, result?: Prisma.InputJsonValue) =>
	finish(id, { status: "failed", error: error.slice(0, 2000), result });

const message = (err: unknown) =>
	err instanceof Error ? err.message : String(err);

export async function runColorsAnalysis(analysisId: string): Promise<void> {
	const analysis = await claim(analysisId, "colors");
	if (!analysis) return;
	try {
		if (!analysis.photoId) {
			await fail(analysisId, "The photo was deleted");
			return;
		}
		const colors = await extractColors(await loadPhotoBytes(analysis.photoId));
		await finish(analysisId, {
			status: "done",
			model: COLOR_ALGORITHM,
			result: (colors.length > 0 ? { colors } : {}) as Prisma.InputJsonValue,
		});
	} catch (err) {
		console.error(`[analysis] colors ${analysisId} failed`, err);
		await fail(analysisId, `Colour extraction failed: ${message(err)}`);
	}
}

/** Categories in tree order with their path ("Knitwear > Jumpers"). */
async function visionCategories(): Promise<VisionCategory[]> {
	const rows = await db().category.findMany({
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	});
	const ids = new Set(rows.map((c) => c.id));
	const out: VisionCategory[] = [];
	const visit = (parentId: string | null, prefix: string[]) => {
		for (const c of rows) {
			// Orphans (parent not found) are listed as roots.
			const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
			if (parent !== parentId || out.some((o) => o.slug === c.slug)) continue;
			const path = [...prefix, c.name];
			out.push({ slug: c.slug, name: c.name, path: path.join(" > ") });
			visit(c.id, path);
		}
	};
	visit(null, []);
	return out;
}

export type VisionDeps = { fetch?: typeof fetch };

export async function runVisionAnalysis(
	analysisId: string,
	deps: VisionDeps = {},
): Promise<void> {
	const analysis = await claim(analysisId, "vision");
	if (!analysis) return;
	try {
		const { OPENROUTER_API_KEY: apiKey, OPENROUTER_VISION_MODEL } = env();
		if (!apiKey) {
			await fail(
				analysisId,
				"Vision analysis is disabled: no OPENROUTER_API_KEY",
			);
			return;
		}
		const photos = await db().photo.findMany({
			where: {
				itemId: analysis.itemId,
				kind: { in: ["main", "label"] },
				status: "ready",
			},
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		});
		const selected = [
			...photos.filter((p) => p.kind === "main").slice(0, MAX_MAIN_PHOTOS),
			...photos.filter((p) => p.kind === "label").slice(0, MAX_LABEL_PHOTOS),
		];
		if (selected.length === 0) {
			await fail(analysisId, "The item has no ready main or label photo");
			return;
		}
		const images: VisionImage[] = await Promise.all(
			selected.map(async (p) => ({
				kind: p.kind as VisionImage["kind"],
				url: await toJpegDataUrl(
					await loadPhotoBytes(p.id),
					p.kind === "label" ? LABEL_EDGE : MAIN_EDGE,
				),
			})),
		);
		const categories = await visionCategories();
		const slugs = categories.map((c) => c.slug);
		const item = await db().item.findUniqueOrThrow({
			where: { id: analysis.itemId },
			select: { ownerId: true },
		});
		const tags = await db().tag.findMany({
			where: { ownerId: item.ownerId },
			select: {
				name: true,
				_count: { select: { items: true, outfits: true } },
			},
		});
		const response = await structuredCompletion({
			apiKey,
			model: analysis.model ?? OPENROUTER_VISION_MODEL,
			messages: buildVisionMessages(
				categories,
				images,
				tags
					.sort(
						(a, b) =>
							b._count.items +
								b._count.outfits -
								(a._count.items + a._count.outfits) ||
							a.name.localeCompare(b.name),
					)
					.slice(0, 50)
					.map((tag) => tag.name),
			),
			schemaName: VISION_SCHEMA_NAME,
			schema: visionJsonSchema(slugs),
			fetch: deps.fetch,
		});
		const parsed = parseVisionOutput(response.content, slugs);
		if (!parsed.ok) {
			await fail(analysisId, parsed.error, {
				raw: parsed.raw as Prisma.InputJsonValue,
			});
			return;
		}
		await finish(analysisId, {
			status: "done",
			model: response.model,
			result: parsed.suggestion as Prisma.InputJsonValue,
		});
	} catch (err) {
		console.error(`[analysis] vision ${analysisId} failed`, err);
		await fail(analysisId, `Vision analysis failed: ${message(err)}`);
	}
}
