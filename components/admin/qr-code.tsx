import { useMemo } from "react";
import { encode } from "uqr";

/** One path for all dark modules: `M x y h1 v1 h-1 z` per module. */
export function qrPath(text: string, border = 2) {
	const { data, size } = encode(text, { ecc: "M", border });
	let d = "";
	data.forEach((row, y) => {
		row.forEach((dark, x) => {
			if (dark) d += `M${x} ${y}h1v1h-1z`;
		});
	});
	return { d, size };
}

/** A QR code as inline SVG (crisp at any print size, no canvas). */
export function QrCode({
	value,
	className,
	title,
}: {
	value: string;
	className?: string;
	title?: string;
}) {
	const { d, size } = useMemo(() => qrPath(value), [value]);
	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={title ?? `QR code for ${value}`}
			shapeRendering="crispEdges"
			className={className}
		>
			<rect width={size} height={size} fill="#fff" />
			<path d={d} fill="#000" />
		</svg>
	);
}
