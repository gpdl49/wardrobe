import type { LocationDto } from "@/lib/api/types";
import { KIND_LABELS } from "@/lib/client/labels";
import { QrCode } from "./qr-code";

export const LABEL_BASE_URL = "https://wardrobe.vidur.xyz/l/";

export const labelUrl = (code: string) =>
	`${LABEL_BASE_URL}${encodeURIComponent(code)}`;

/** A4 sheet of 3 × 8 labels, 70 × 37 mm (e.g. Avery 3475 / L7159-style). */
export const SHEET = { columns: 3, rows: 8, width: 70, height: 37 } as const;
export const PER_SHEET = SHEET.columns * SHEET.rows;

type Label = Pick<LocationDto, "id" | "kind" | "code" | "name">;

/**
 * Splits labels into A4 pages, leaving the first `skip` positions blank so a
 * partly used sheet can be fed again.
 */
export function paginate(
	labels: Label[],
	skip = 0,
): Array<Array<Label | null>> {
	const cells: Array<Label | null> = [
		...Array.from(
			{ length: Math.max(0, Math.min(skip, PER_SHEET - 1)) },
			() => null,
		),
		...labels,
	];
	const pages: Array<Array<Label | null>> = [];
	for (let i = 0; i < cells.length; i += PER_SHEET) {
		pages.push(cells.slice(i, i + PER_SHEET));
	}
	return pages;
}

/**
 * Printable sheets, sized in millimetres so they print 1:1. On screen they
 * scroll sideways on small displays.
 */
export function LabelSheet({
	locations,
	skip = 0,
}: {
	locations: Label[];
	skip?: number;
}) {
	const pages = paginate(locations, skip);
	return (
		<div className="flex flex-col items-center gap-6 print:block print:gap-0">
			{pages.map((cells, p) => (
				<section
					// biome-ignore lint/suspicious/noArrayIndexKey: pages are positional.
					key={p}
					aria-label={`Sheet ${p + 1} of ${pages.length}`}
					className="grid shrink-0 bg-white text-black shadow-lg ring-1 ring-black/10 print:shadow-none print:ring-0 print:break-after-page print:last:break-after-auto"
					style={{
						width: "210mm",
						height: "297mm",
						padding: `${(297 - SHEET.rows * SHEET.height) / 2}mm ${(210 - SHEET.columns * SHEET.width) / 2}mm`,
						gridTemplateColumns: `repeat(${SHEET.columns}, ${SHEET.width}mm)`,
						gridTemplateRows: `repeat(${SHEET.rows}, ${SHEET.height}mm)`,
					}}
				>
					{cells.map((cell, i) =>
						cell ? (
							<div
								key={cell.id}
								data-testid="label"
								className="flex items-center gap-[3mm] overflow-hidden p-[3mm]"
							>
								<QrCode
									value={labelUrl(cell.code)}
									className="h-[29mm] w-[29mm] shrink-0"
								/>
								<div className="flex min-w-0 flex-col gap-[1mm]">
									<span className="text-[7pt] tracking-wider uppercase">
										{KIND_LABELS[cell.kind].one}
									</span>
									<span className="font-mono text-[18pt] leading-none font-bold break-all">
										{cell.code}
									</span>
									{cell.name && cell.name !== cell.code ? (
										<span className="line-clamp-3 text-[9pt] leading-tight">
											{cell.name}
										</span>
									) : null}
								</div>
							</div>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: skipped positions have no identity.
							<div key={`blank-${i}`} aria-hidden />
						),
					)}
				</section>
			))}
		</div>
	);
}
