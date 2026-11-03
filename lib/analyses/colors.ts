import sharp from "sharp";
import {
	deltaE76Sq,
	deltaE2000,
	type Lab,
	labToHex,
	rgbToLab,
} from "@/lib/analyses/color-space";
import { nearestPaletteColor } from "@/lib/analyses/palette";
import type { ItemColor } from "@/lib/api/types";

/**
 * Dominant garment colours, computed locally (docs/wardrobe.md "Image
 * analysis"):
 *
 * 1. Downscale to ~128 px (colour, not detail, matters; keeps it ~10 ms).
 * 2. Separate the garment from the background. Photos are of one garment on
 *    a bed, floor or wall, so the background is roughly uniform: estimate its
 *    colour(s) from the border pixels and flood-fill inwards over pixels close
 *    to it in CIELAB. Flood fill (not a global threshold) keeps garment pixels
 *    that happen to match the background, like a white print on a navy tee on
 *    a white sheet. Transparent pixels are background too.
 * 3. k-means in CIELAB with deterministic k-means++ seeding (fixed-seed PRNG),
 *    so the same photo always gives the same answer.
 * 4. Merge near-duplicate clusters (CIEDE2000), name each from the clothing
 *    palette, merge clusters that got the same name, drop small ones.
 */

export const COLOR_ALGORITHM = "kmeans-lab-v1";

export type ExtractColorsOptions = {
	/** Long edge after downscaling. */
	size?: number;
	/** Clusters before merging. */
	k?: number;
	/** Colours under this share of the garment are dropped. */
	minShare?: number;
};

const DEFAULTS = { size: 128, k: 6, minShare: 0.05 } as const;

/** Clusters closer than this (CIEDE2000) are the same colour in shadow/light. */
const MERGE_DISTANCE = 7;
/** A border colour covering at least this share of the border is background. */
const BACKGROUND_MIN_BORDER_SHARE = 0.15;
/** Background colours must cover this much of the border to trust them. */
const BACKGROUND_MIN_COVERAGE = 0.6;
/** If less than this much is left after background removal, keep everything. */
const MIN_FOREGROUND_SHARE = 0.05;

export async function extractColors(
	image: Uint8Array,
	options: ExtractColorsOptions = {},
): Promise<ItemColor[]> {
	const { size, k, minShare } = { ...DEFAULTS, ...options };
	const { data, info } = await sharp(image)
		.rotate()
		.resize({
			width: size,
			height: size,
			fit: "inside",
			withoutEnlargement: true,
		})
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return colorsFromPixels(
		{ data, width: info.width, height: info.height },
		{ k, minShare },
	);
}

export type RgbaImage = { data: Uint8Array; width: number; height: number };

/** Pure core of extractColors, on raw RGBA pixels. */
export function colorsFromPixels(
	image: RgbaImage,
	options: { k?: number; minShare?: number } = {},
): ItemColor[] {
	const { k, minShare } = { ...DEFAULTS, ...options };
	const { width, height, data } = image;
	const n = width * height;
	const labs: Lab[] = new Array(n);
	const opaque = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const o = i * 4;
		labs[i] = rgbToLab(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0);
		opaque[i] = (data[o + 3] ?? 255) >= 128 ? 1 : 0;
	}

	const background = removeBackground(labs, opaque, width, height);
	let foreground: Lab[] = [];
	for (let i = 0; i < n; i++) {
		if (opaque[i] && !background[i]) foreground.push(labs[i] as Lab);
	}
	if (foreground.length < MIN_FOREGROUND_SHARE * n) {
		// Background detection swallowed the garment (white shirt on a white
		// sheet): better to describe the whole photo than nothing.
		foreground = labs.filter((_, i) => opaque[i]);
	}
	if (foreground.length === 0) {
		return [];
	}

	const clusters = mergeClusters(kMeans(foreground, k));
	return nameClusters(clusters, minShare);
}

type Cluster = { lab: Lab; count: number };

/** Marks background pixels: flood fill from the border over background colours. */
function removeBackground(
	labs: Lab[],
	opaque: Uint8Array,
	width: number,
	height: number,
): Uint8Array {
	const n = width * height;
	const background = new Uint8Array(n);
	const border: number[] = [];
	const ring = Math.max(1, Math.round(Math.min(width, height) * 0.02));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (x < ring || y < ring || x >= width - ring || y >= height - ring) {
				const i = y * width + x;
				if (opaque[i]) border.push(i);
			}
		}
	}
	// Transparent pixels are background regardless.
	for (let i = 0; i < n; i++) {
		if (!opaque[i]) background[i] = 1;
	}
	if (border.length === 0) {
		return background;
	}

	const borderLabs = border.map((i) => labs[i] as Lab);
	const assignments = new Int32Array(borderLabs.length);
	const borderClusters = kMeans(borderLabs, 3, assignments);
	const bgIndexes = borderClusters
		.map((c, index) => ({ ...c, index }))
		.filter((c) => c.count >= BACKGROUND_MIN_BORDER_SHARE * border.length);
	const covered = bgIndexes.reduce((sum, c) => sum + c.count, 0);
	if (covered < BACKGROUND_MIN_COVERAGE * border.length) {
		// No dominant border colour: the garment fills the frame or the scene
		// is busy. Treat everything as garment.
		return background;
	}

	// Tolerance adapts to how noisy the background is (texture, shading).
	const bgSet = new Set(bgIndexes.map((c) => c.index));
	let sumSq = 0;
	let count = 0;
	for (let j = 0; j < borderLabs.length; j++) {
		const cluster = assignments[j] ?? 0;
		if (bgSet.has(cluster)) {
			sumSq += deltaE76Sq(
				borderLabs[j] as Lab,
				(borderClusters[cluster] as Cluster).lab,
			);
			count++;
		}
	}
	const rms = Math.sqrt(sumSq / Math.max(1, count));
	const tolerance = Math.min(25, Math.max(10, 3 * rms));
	const toleranceSq = tolerance * tolerance;
	const bgColors = bgIndexes.map((c) => c.lab);
	const isBackgroundColor = (lab: Lab) =>
		bgColors.some((bg) => deltaE76Sq(lab, bg) <= toleranceSq);

	const stack: number[] = [];
	for (const i of border) {
		if (!background[i] && isBackgroundColor(labs[i] as Lab)) {
			background[i] = 1;
			stack.push(i);
		}
	}
	while (stack.length > 0) {
		const i = stack.pop() as number;
		const x = i % width;
		const neighbours = [
			x > 0 ? i - 1 : -1,
			x < width - 1 ? i + 1 : -1,
			i - width,
			i + width,
		];
		for (const j of neighbours) {
			if (
				j >= 0 &&
				j < n &&
				!background[j] &&
				isBackgroundColor(labs[j] as Lab)
			) {
				background[j] = 1;
				stack.push(j);
			}
		}
	}
	return background;
}

/** mulberry32: a tiny seeded PRNG, so clustering is deterministic. */
function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Lloyd's k-means in Lab with k-means++ seeding from a fixed seed. Returns
 * non-empty clusters; writes each point's cluster into `assignments`.
 */
export function kMeans(
	points: Lab[],
	k: number,
	assignments: Int32Array = new Int32Array(points.length),
	maxIterations = 30,
): Cluster[] {
	const n = points.length;
	if (n === 0) return [];
	const random = prng(0x5eed);
	const centroids: Lab[] = [points[Math.floor(random() * n)] as Lab];
	const nearestSq = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
	while (centroids.length < Math.min(k, n)) {
		const last = centroids[centroids.length - 1] as Lab;
		let total = 0;
		for (let i = 0; i < n; i++) {
			const d = deltaE76Sq(points[i] as Lab, last);
			if (d < (nearestSq[i] as number)) nearestSq[i] = d;
			total += nearestSq[i] as number;
		}
		if (total === 0) break; // Fewer distinct colours than k.
		let target = random() * total;
		let chosen = n - 1;
		for (let i = 0; i < n; i++) {
			target -= nearestSq[i] as number;
			if (target <= 0) {
				chosen = i;
				break;
			}
		}
		centroids.push(points[chosen] as Lab);
	}

	const kk = centroids.length;
	const sums = new Float64Array(kk * 3);
	const counts = new Int32Array(kk);
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		let changed = false;
		sums.fill(0);
		counts.fill(0);
		for (let i = 0; i < n; i++) {
			const p = points[i] as Lab;
			let best = 0;
			let bestD = Number.POSITIVE_INFINITY;
			for (let c = 0; c < kk; c++) {
				const d = deltaE76Sq(p, centroids[c] as Lab);
				if (d < bestD) {
					bestD = d;
					best = c;
				}
			}
			if (assignments[i] !== best) {
				changed = true;
				assignments[i] = best;
			}
			sums[best * 3] = (sums[best * 3] as number) + p[0];
			sums[best * 3 + 1] = (sums[best * 3 + 1] as number) + p[1];
			sums[best * 3 + 2] = (sums[best * 3 + 2] as number) + p[2];
			counts[best] = (counts[best] as number) + 1;
		}
		for (let c = 0; c < kk; c++) {
			const m = counts[c] as number;
			if (m > 0) {
				centroids[c] = [
					(sums[c * 3] as number) / m,
					(sums[c * 3 + 1] as number) / m,
					(sums[c * 3 + 2] as number) / m,
				];
			}
		}
		if (!changed && iteration > 0) break;
	}
	return centroids.map((lab, c) => ({ lab, count: counts[c] as number }));
}

function weightedMerge(a: Cluster, b: Cluster): Cluster {
	const count = a.count + b.count;
	const w = (x: number, y: number) => (x * a.count + y * b.count) / count;
	return {
		lab: [w(a.lab[0], b.lab[0]), w(a.lab[1], b.lab[1]), w(a.lab[2], b.lab[2])],
		count,
	};
}

/** Agglomerates clusters closer than MERGE_DISTANCE, closest pair first. */
export function mergeClusters(input: Cluster[]): Cluster[] {
	const clusters = input.filter((c) => c.count > 0);
	for (;;) {
		let best: [number, number] | undefined;
		let bestD = MERGE_DISTANCE;
		for (let i = 0; i < clusters.length; i++) {
			for (let j = i + 1; j < clusters.length; j++) {
				const d = deltaE2000(
					(clusters[i] as Cluster).lab,
					(clusters[j] as Cluster).lab,
				);
				if (d < bestD) {
					bestD = d;
					best = [i, j];
				}
			}
		}
		if (!best) return clusters;
		const [i, j] = best;
		clusters[i] = weightedMerge(clusters[i] as Cluster, clusters[j] as Cluster);
		clusters.splice(j, 1);
	}
}

/** Names clusters, merges same-named ones, drops small ones, normalises. */
function nameClusters(clusters: Cluster[], minShare: number): ItemColor[] {
	const byName = new Map<string, Cluster>();
	for (const cluster of clusters) {
		const { name } = nearestPaletteColor(cluster.lab);
		const existing = byName.get(name);
		byName.set(name, existing ? weightedMerge(existing, cluster) : cluster);
	}
	const total = clusters.reduce((sum, c) => sum + c.count, 0);
	const kept = [...byName.entries()].filter(
		([, c]) => c.count / total >= minShare,
	);
	const keptTotal = kept.reduce((sum, [, c]) => sum + c.count, 0);
	return kept
		.map(([name, c]) => ({
			name,
			hex: labToHex(c.lab),
			share: Math.round((c.count / keptTotal) * 1000) / 1000,
		}))
		.sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}
