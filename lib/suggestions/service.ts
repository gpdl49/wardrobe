import { z } from "zod";
import {
	accessToWardrobe,
	loadAccess,
	requireEdit,
	requireRead,
} from "@/lib/access";
import type { Viewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { env, suggestionsEnabled } from "@/lib/env";
import { conflict, notFound, unprocessable } from "@/lib/http/errors";
import { suggestionRun } from "@/lib/jobs/definitions/suggestion-run";
import { enqueue } from "@/lib/jobs/queue";
import { presentRun, presentSuggestion } from "./present";
import { DEFAULT_TEXT_MODEL } from "./prompt";
import type { CreateSuggestionRunInput } from "./schema";

const include = { suggestions: { orderBy: { position: "asc" as const } } };
function validId(id: string) {
	if (!z.uuid().safeParse(id).success) throw notFound("Suggestion not found");
	return id;
}
export async function listRuns(viewer: Viewer, owner = viewer.id) {
	const ctx = await loadAccess(viewer);
	requireRead(accessToWardrobe(ctx, owner), "Wardrobe");
	const rows = await db().suggestionRun.findMany({
		where: { ownerId: owner },
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: 20,
		include,
	});
	return Promise.all(rows.map((row) => presentRun(row, ctx)));
}
export async function getRun(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const row = await db().suggestionRun.findUnique({
		where: { id: validId(id) },
		include,
	});
	if (!row) throw notFound("Suggestion run not found");
	requireRead(accessToWardrobe(ctx, row.ownerId), "Wardrobe");
	return presentRun(row, ctx);
}
export async function createRun(
	viewer: Viewer,
	input: CreateSuggestionRunInput,
) {
	const ctx = await loadAccess(viewer);
	const ownerId = input.ownerId ?? viewer.id;
	requireEdit(accessToWardrobe(ctx, ownerId), "Wardrobe");
	if (!suggestionsEnabled())
		throw conflict("Suggestions are disabled (no OPENROUTER_API_KEY)");
	const where = {
		ownerId,
		status: { in: ["active", "stored"] as ("active" | "stored")[] },
	};
	if ((await db().item.count({ where })) < 4)
		throw conflict("At least four active or stored items are required");
	if (
		input.itemIds?.length &&
		(await db().item.count({
			where: { ...where, id: { in: input.itemIds } },
		})) !== input.itemIds.length
	)
		throw unprocessable("Required items must be available in this wardrobe");
	const { ownerId: _, ...request } = input;
	let row = await db().suggestionRun.create({
		data: {
			ownerId,
			requestedById: viewer.id,
			request,
			model: env().OPENROUTER_TEXT_MODEL ?? DEFAULT_TEXT_MODEL,
		},
		include,
	});
	try {
		await enqueue(suggestionRun, { runId: row.id });
	} catch (err) {
		row = await db().suggestionRun.update({
			where: { id: row.id },
			data: {
				status: "failed",
				error: `Could not enqueue: ${err instanceof Error ? err.message : String(err)}`,
			},
			include,
		});
	}
	return presentRun(row, ctx);
}
export async function dismissSuggestion(viewer: Viewer, id: string) {
	const ctx = await loadAccess(viewer);
	const row = await db().outfitSuggestion.findUnique({
		where: { id: validId(id) },
	});
	if (!row) throw notFound("Suggestion not found");
	requireEdit(accessToWardrobe(ctx, row.ownerId), "Wardrobe");
	const updated = await db().outfitSuggestion.updateMany({
		where: { id: row.id, feedback: { not: "saved" } },
		data: { feedback: "dismissed" },
	});
	// SQL null comparisons need a separate predicate.
	if (!updated.count && row.feedback === null)
		await db().outfitSuggestion.updateMany({
			where: { id: row.id, feedback: null },
			data: { feedback: "dismissed" },
		});
	const current = await db().outfitSuggestion.findUniqueOrThrow({
		where: { id: row.id },
	});
	if (current.feedback === "saved")
		throw conflict("Suggestion is already saved");
	return presentSuggestion(current, ctx);
}
