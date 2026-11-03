"use client";

import { Check, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Badge,
	ErrorText,
	errorMessage,
	Spinner,
} from "@/components/ui/feedback";
import type {
	AnalysisDto,
	ItemDetailDto,
	ItemSuggestion,
} from "@/lib/api/types";
import { isApiError, type SuggestionField } from "@/lib/client/api";
import { formatDateTime, SEASON_LABELS } from "@/lib/client/labels";
import {
	useApplySuggestion,
	useCategories,
	useRerunAnalysis,
} from "@/lib/client/queries";
import { ColorDots } from "./item-tile";

/** Display order and labels of suggestion fields. */
export const SUGGESTION_FIELDS: Array<[SuggestionField, string]> = [
	["name", "Name"],
	["categorySlug", "Category"],
	["brand", "Brand"],
	["size", "Size"],
	["colors", "Colours"],
	["pattern", "Pattern"],
	["material", "Material"],
	["seasons", "Seasons"],
	["tags", "Tags"],
	["labelText", "Label"],
];

const sameSet = (a: string[], b: string[]) =>
	a.length === b.length && a.every((x) => b.includes(x));

/** True when the item already has what the analysis suggests for `field`. */
export function matchesItem(
	item: ItemDetailDto,
	field: SuggestionField,
	suggestion: ItemSuggestion,
): boolean {
	switch (field) {
		case "categorySlug":
			return item.category?.slug === suggestion.categorySlug;
		case "colors":
			return sameSet(
				item.colors.map((c) => c.name),
				(suggestion.colors ?? []).map((c) => c.name),
			);
		case "seasons":
			return sameSet(item.seasons, suggestion.seasons ?? []);
		case "tags":
			return (suggestion.tags ?? []).every((t) =>
				item.tags.includes(t.toLowerCase()),
			);
		case "labelText":
			return Boolean(
				suggestion.labelText && item.notes?.includes(suggestion.labelText),
			);
		default:
			return (
				(item[field] ?? "").toLowerCase() ===
				(suggestion[field] ?? "").toLowerCase()
			);
	}
}

/** Fields an analysis has a value for, in display order. */
export function suggestedFields(suggestion: ItemSuggestion): SuggestionField[] {
	return SUGGESTION_FIELDS.map(([field]) => field).filter((field) => {
		const value = suggestion[field];
		return Array.isArray(value) ? value.length > 0 : Boolean(value);
	});
}

const KIND_LABELS: Record<AnalysisDto["kind"], string> = {
	colors: "Colours",
	vision: "Vision",
};

export function SuggestionsPanel({ item }: { item: ItemDetailDto }) {
	const rerun = useRerunAnalysis(item.id);
	const running = item.analyses.some(
		(a) => a.status === "queued" || a.status === "running",
	);
	const analyses = [...item.analyses].sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	);
	return (
		<section
			aria-labelledby="suggestions-heading"
			className="rounded-card border border-line bg-surface"
		>
			<header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
				<h2
					id="suggestions-heading"
					className="flex items-center gap-2 font-semibold"
				>
					<Sparkles aria-hidden className="size-4 text-accent" />
					Suggestions
				</h2>
				<Button
					variant="ghost"
					size="sm"
					disabled={rerun.isPending || running}
					onClick={() => rerun.mutate()}
				>
					<RefreshCw className={running ? "animate-spin" : undefined} />
					{running ? "Analysing…" : "Re-run analysis"}
				</Button>
			</header>
			{rerun.error ? (
				<ErrorText
					className="m-4"
					error={
						isApiError(rerun.error, 404) || isApiError(rerun.error, 405)
							? "Re-running analysis is not available on this server."
							: errorMessage(rerun.error)
					}
				/>
			) : null}
			{analyses.length === 0 ? (
				<p className="px-4 py-6 text-sm text-muted">
					No analyses yet. They run when a photo has been processed.
				</p>
			) : (
				<ul className="divide-y divide-line">
					{analyses.map((analysis) => (
						<li key={analysis.id}>
							<AnalysisCard item={item} analysis={analysis} />
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function AnalysisCard({
	item,
	analysis,
}: {
	item: ItemDetailDto;
	analysis: AnalysisDto;
}) {
	const apply = useApplySuggestion(item.id);
	const categories = useCategories();
	const [pending, setPending] = useState<SuggestionField[]>([]);
	const result = analysis.result;
	const fields = result ? suggestedFields(result) : [];
	const open = result
		? fields.filter((f) => !matchesItem(item, f, result))
		: [];

	const accept = (fields: SuggestionField[]) => {
		setPending(fields);
		apply.mutate(
			{ analysisId: analysis.id, fields },
			{ onSettled: () => setPending([]) },
		);
	};

	const render = (field: SuggestionField): ReactNode => {
		if (!result) return null;
		switch (field) {
			case "categorySlug": {
				const c = categories.flat.find((x) => x.slug === result.categorySlug);
				return c?.path ?? result.categorySlug;
			}
			case "colors":
				return (
					<span className="flex items-center gap-2">
						<ColorDots colors={result.colors ?? []} max={6} />
						{(result.colors ?? []).map((c) => c.name).join(", ")}
					</span>
				);
			case "seasons":
				return (result.seasons ?? []).map((s) => SEASON_LABELS[s]).join(", ");
			case "tags":
				return (result.tags ?? []).join(", ");
			case "labelText":
				return <span className="whitespace-pre-wrap">{result.labelText}</span>;
			default:
				return result[field];
		}
	};

	return (
		<div className="flex flex-col gap-3 px-4 py-3">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="font-medium">{KIND_LABELS[analysis.kind]}</span>
				{analysis.model ? (
					<span className="truncate text-xs text-faint">{analysis.model}</span>
				) : null}
				<span className="ml-auto text-xs text-faint">
					{formatDateTime(analysis.createdAt)}
				</span>
				{analysis.status === "queued" || analysis.status === "running" ? (
					<Badge tone="accent">
						<Spinner className="size-3 text-accent" />
						{analysis.status === "queued" ? "Queued" : "Running"}
					</Badge>
				) : analysis.status === "failed" ? (
					<Badge tone="danger">Failed</Badge>
				) : analysis.appliedAt ? (
					<Badge tone="success">Applied</Badge>
				) : null}
			</div>
			{analysis.status === "failed" && analysis.error ? (
				<p className="text-sm text-danger">{analysis.error}</p>
			) : null}
			{result && fields.length > 0 ? (
				<dl className="flex flex-col gap-1">
					{fields.map((field) => {
						const label =
							SUGGESTION_FIELDS.find(([f]) => f === field)?.[1] ?? field;
						const matches = matchesItem(item, field, result);
						return (
							<div
								key={field}
								className="flex min-h-11 items-center gap-3 rounded-lg px-2 odd:bg-sunken/60 pointer-fine:min-h-9"
							>
								<dt className="w-20 shrink-0 text-sm text-muted">{label}</dt>
								<dd className="min-w-0 flex-1 text-sm break-words">
									{render(field)}
								</dd>
								{matches ? (
									<span
										className="flex size-11 items-center justify-center text-success pointer-fine:size-8"
										title="Already on the item"
									>
										<Check aria-label={`${label} matches`} className="size-4" />
									</span>
								) : (
									<Button
										size="sm"
										variant="ghost"
										className="text-accent"
										disabled={apply.isPending}
										aria-label={`Accept ${label}`}
										onClick={() => accept([field])}
									>
										{pending.includes(field) ? <Spinner /> : "Accept"}
									</Button>
								)}
							</div>
						);
					})}
				</dl>
			) : null}
			<ErrorText error={apply.error} />
			{open.length > 1 ? (
				<Button
					variant="secondary"
					size="sm"
					className="self-start"
					disabled={apply.isPending}
					onClick={() => accept(open)}
				>
					Accept all ({open.length})
				</Button>
			) : null}
		</div>
	);
}
