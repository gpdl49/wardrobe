"use client";

import { Printer, QrCode as QrIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorText, Loading } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { KIND_LABELS, LOCATION_KINDS } from "@/lib/client/labels";
import { useLocations } from "@/lib/client/queries";
import { LabelSheet, PER_SHEET } from "./label-sheet";

export function LabelsDesigner() {
	const id = useId();
	const locations = useLocations();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [skip, setSkip] = useState(0);
	const list = locations.data ?? [];
	const chosen = useMemo(
		() => list.filter((l) => selected.has(l.id)),
		[list, selected],
	);

	const toggle = (ids: string[], on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			for (const i of ids) {
				if (on) next.add(i);
				else next.delete(i);
			}
			return next;
		});

	return (
		<>
			{/* Only the sheets print, edge to edge. */}
			<style>{"@media print { @page { size: A4; margin: 0; } }"}</style>
			<div className="print:hidden">
				<PageHeader title="Labels">
					<Button
						variant="primary"
						disabled={chosen.length === 0}
						onClick={() => window.print()}
					>
						<Printer />
						Print {chosen.length > 0 ? chosen.length : ""}
					</Button>
				</PageHeader>
				{locations.isPending ? (
					<Loading />
				) : locations.isError ? (
					<ErrorText error={locations.error} />
				) : list.length === 0 ? (
					<EmptyState icon={<QrIcon />} title="No locations yet">
						Create locations first, then print their labels here.
					</EmptyState>
				) : (
					<div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
						<div className="flex flex-col gap-5">
							<p className="text-sm text-muted">
								Each label's QR code opens{" "}
								<code className="text-xs">
									wardrobe.vidur.xyz/l/&lt;your id&gt;/&lt;code&gt;
								</code>
								, so it only ever opens your own location. Sheets are A4, 3 × 8
								labels of 70 × 37 mm; print at 100 %.
							</p>
							<Field
								label="Skip labels already used"
								htmlFor={`${id}-skip`}
								hint="Leaves the first positions of the first sheet blank."
							>
								<Input
									id={`${id}-skip`}
									type="number"
									inputMode="numeric"
									min={0}
									max={PER_SHEET - 1}
									value={skip}
									onChange={(e) =>
										setSkip(
											Math.min(
												PER_SHEET - 1,
												Math.max(0, Number(e.target.value) || 0),
											),
										)
									}
									className="w-28"
								/>
							</Field>
							{LOCATION_KINDS.map((kind) => {
								const ofKind = list.filter((l) => l.kind === kind);
								if (ofKind.length === 0) return null;
								const ids = ofKind.map((l) => l.id);
								const all = ids.every((i) => selected.has(i));
								return (
									<fieldset key={kind} className="flex flex-col">
										<legend className="mb-1 flex w-full items-center justify-between">
											<span className="font-semibold">
												{KIND_LABELS[kind].many}
											</span>
										</legend>
										<label className="flex min-h-11 items-center gap-3 text-sm text-muted pointer-fine:min-h-8">
											<input
												type="checkbox"
												checked={all}
												onChange={(e) => toggle(ids, e.target.checked)}
												className="size-4 accent-accent"
											/>
											All {KIND_LABELS[kind].many.toLowerCase()}
										</label>
										{ofKind.map((l) => (
											<label
												key={l.id}
												className="flex min-h-11 items-center gap-3 pl-4 pointer-fine:min-h-8"
											>
												<input
													type="checkbox"
													checked={selected.has(l.id)}
													onChange={(e) => toggle([l.id], e.target.checked)}
													className="size-4 accent-accent"
												/>
												<span className="font-mono text-sm font-semibold">
													{l.code}
												</span>
												<span className="truncate text-sm text-muted">
													{l.name}
												</span>
											</label>
										))}
									</fieldset>
								);
							})}
						</div>
						<div className="min-w-0">
							{chosen.length === 0 ? (
								<EmptyState icon={<QrIcon />} title="Pick locations">
									The preview of the sheet appears here.
								</EmptyState>
							) : (
								<div className="overflow-auto rounded-card bg-sunken p-4">
									{/* Zoomed preview (zoom, unlike scale, shrinks the layout box); print uses the full-size sheet below. */}
									<div className="[zoom:0.42] sm:[zoom:0.6] xl:[zoom:0.75]">
										<LabelSheet locations={chosen} skip={skip} />
									</div>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
			<div className="hidden print:block">
				<LabelSheet locations={chosen} skip={skip} />
			</div>
		</>
	);
}
