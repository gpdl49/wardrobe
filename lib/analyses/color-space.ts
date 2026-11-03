/**
 * sRGB <-> CIELAB (D65) and CIEDE2000. Pure; no dependencies. Lab is used
 * for clustering and palette matching because Euclidean distance there is
 * close to perceived colour difference, unlike in RGB.
 */

export type Lab = readonly [l: number, a: number, b: number];
export type Rgb = readonly [r: number, g: number, b: number];

// D65 reference white.
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

/** sRGB channel 0..255 -> linear 0..1. Precomputed: hot in the pixel loop. */
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
	const c = i / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInv = (t: number) => {
	const t3 = t * t * t;
	return t3 > EPSILON ? t3 : (116 * t - 16) / KAPPA;
};

export function rgbToLab(r: number, g: number, b: number): Lab {
	const lr = LINEAR[r] ?? 0;
	const lg = LINEAR[g] ?? 0;
	const lb = LINEAR[b] ?? 0;
	const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / XN;
	const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / YN;
	const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / ZN;
	const fx = f(x);
	const fy = f(y);
	const fz = f(z);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([l, a, b]: Lab): Rgb {
	const fy = (l + 16) / 116;
	const fx = fy + a / 500;
	const fz = fy - b / 200;
	const x = fInv(fx) * XN;
	const y = (l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA) * YN;
	const z = fInv(fz) * ZN;
	const lin = [
		3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
		-0.969266 * x + 1.8760108 * y + 0.041556 * z,
		0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
	];
	const [r, g, bl] = lin.map((c) => {
		const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
		return Math.round(Math.min(1, Math.max(0, v)) * 255);
	}) as [number, number, number];
	return [r, g, bl];
}

export function hexToRgb(hex: string): Rgb {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex);
	if (!m?.[1]) {
		throw new Error(`Not a #rrggbb colour: ${hex}`);
	}
	const n = Number.parseInt(m[1], 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex([r, g, b]: Rgb): string {
	return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export const hexToLab = (hex: string): Lab => rgbToLab(...hexToRgb(hex));
export const labToHex = (lab: Lab): string => rgbToHex(labToRgb(lab));

/** Squared Euclidean distance (CIE76 squared): cheap, for clustering. */
export function deltaE76Sq(p: Lab, q: Lab): number {
	const dl = p[0] - q[0];
	const da = p[1] - q[1];
	const db = p[2] - q[2];
	return dl * dl + da * da + db * db;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** CIEDE2000 (Sharma et al. 2005). ~1 is a just-noticeable difference. */
export function deltaE2000(p: Lab, q: Lab): number {
	const [l1, a1, b1] = p;
	const [l2, a2, b2] = q;
	const c1 = Math.hypot(a1, b1);
	const c2 = Math.hypot(a2, b2);
	const cBar = (c1 + c2) / 2;
	const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
	const a1p = (1 + g) * a1;
	const a2p = (1 + g) * a2;
	const c1p = Math.hypot(a1p, b1);
	const c2p = Math.hypot(a2p, b2);
	const h1p = c1p === 0 ? 0 : (deg(Math.atan2(b1, a1p)) + 360) % 360;
	const h2p = c2p === 0 ? 0 : (deg(Math.atan2(b2, a2p)) + 360) % 360;

	const dLp = l2 - l1;
	const dCp = c2p - c1p;
	let dhp = 0;
	if (c1p * c2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));

	const lBarP = (l1 + l2) / 2;
	const cBarP = (c1p + c2p) / 2;
	let hBarP = h1p + h2p;
	if (c1p * c2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
		else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
		else hBarP = (h1p + h2p - 360) / 2;
	}
	const t =
		1 -
		0.17 * Math.cos(rad(hBarP - 30)) +
		0.24 * Math.cos(rad(2 * hBarP)) +
		0.32 * Math.cos(rad(3 * hBarP + 6)) -
		0.2 * Math.cos(rad(4 * hBarP - 63));
	const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
	const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
	const sl =
		1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
	const sc = 1 + 0.045 * cBarP;
	const sh = 1 + 0.015 * cBarP * t;
	const rt = -Math.sin(rad(2 * dTheta)) * rc;
	return Math.sqrt(
		(dLp / sl) ** 2 +
			(dCp / sc) ** 2 +
			(dHp / sh) ** 2 +
			rt * (dCp / sc) * (dHp / sh),
	);
}
