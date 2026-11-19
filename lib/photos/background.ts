import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import sharp, { type OutputInfo } from "sharp";

const EDGE = 320;
const PIXELS = EDGE * EDGE;
const NORMALIZATION = [
	[0.485, 0.229],
	[0.456, 0.224],
	[0.406, 0.225],
] as const;
const CLEAR = 0.12;
const SOLID = 0.88;

type RawPhoto = { data: Buffer; info: OutputInfo };
let session: Promise<InferenceSession | null> | undefined;

async function loadModel(): Promise<InferenceSession | null> {
	try {
		const weights = await readFile(
			join(process.cwd(), "models", "u2netp.onnx"),
		);
		env.wasm.numThreads = 1;
		return await InferenceSession.create(new Uint8Array(weights), {
			executionProviders: ["wasm"],
		});
	} catch (error) {
		console.warn("[photos] Background removal model unavailable", error);
		return null;
	}
}

function hasTransparency(photo: RawPhoto): boolean {
	if (photo.info.channels !== 4) return false;
	for (let i = 3; i < photo.data.length; i += 4) {
		if (photo.data[i] !== 255) return true;
	}
	return false;
}

/** Fraction of perimeter pixels satisfying a predicate on the model grid. */
function borderShare(matches: (pixel: number) => boolean): number {
	let count = 0;
	for (let i = 0; i < EDGE; i++) {
		count += Number(matches(i)) + Number(matches(PIXELS - EDGE + i));
		if (i > 0 && i < EDGE - 1) {
			count += Number(matches(i * EDGE)) + Number(matches((i + 1) * EDGE - 1));
		}
	}
	return count / (4 * (EDGE - 1));
}

function lightNeutralBorder(rgb: Buffer): boolean {
	return (
		borderShare((i) => {
			const r = rgb[i * 3] as number;
			const g = rgb[i * 3 + 1] as number;
			const b = rgb[i * 3 + 2] as number;
			const low = Math.min(r, g, b);
			return low >= 185 && Math.max(r, g, b) - low <= 30;
		}) >= 0.8
	);
}

async function foregroundMask(rgb: Buffer): Promise<Buffer | null> {
	session ??= loadModel();
	const model = await session;
	if (!model) return null;

	// U²-Net-P takes a 320×320 RGB tensor in CHW order and outputs a soft mask.
	const tensor = new Float32Array(PIXELS * 3);
	for (const [c, [mean, deviation]] of NORMALIZATION.entries()) {
		for (let i = 0; i < PIXELS; i++) {
			tensor[c * PIXELS + i] =
				((rgb[i * 3 + c] as number) / 255 - mean) / deviation;
		}
	}
	const inputName = model.inputNames[0];
	const outputName = model.outputNames[0];
	if (!inputName || !outputName) return null;
	const results = await model.run(
		{
			[inputName]: new Tensor("float32", tensor, [1, 3, EDGE, EDGE]),
		},
		[outputName],
	);
	const scores = results[outputName]?.data;
	if (!(scores instanceof Float32Array) || scores.length !== PIXELS)
		return null;
	if (borderShare((i) => (scores[i] as number) <= CLEAR) < 0.75) return null;

	let solid = 0;
	let clear = 0;
	const alpha = Buffer.alloc(PIXELS);
	for (let i = 0; i < PIXELS; i++) {
		const score = scores[i] as number;
		if (!Number.isFinite(score)) return null;
		if (score <= CLEAR) clear++;
		if (score >= SOLID) solid++;
		const coverage = (score - CLEAR) / (SOLID - CLEAR);
		alpha[i] = Math.round(Math.max(0, Math.min(1, coverage)) * 255);
	}
	return solid >= PIXELS * 0.04 && clear >= PIXELS * 0.12 ? alpha : null;
}

/** Best-effort cutout of one garment photographed on a light neutral backdrop. */
export async function removePhotoBackground(
	photo: RawPhoto,
): Promise<RawPhoto | null> {
	const { width, height, channels } = photo.info;
	if (channels < 3 || hasTransparency(photo)) return null;
	try {
		const rgb = await sharp(photo.data, { raw: { width, height, channels } })
			.removeAlpha()
			.resize(EDGE, EDGE, { fit: "fill" })
			.raw()
			.toBuffer();
		if (!lightNeutralBorder(rgb)) return null;
		const alpha = await foregroundMask(rgb);
		if (!alpha) return null;

		const mask = await sharp(alpha, {
			raw: { width: EDGE, height: EDGE, channels: 1 },
		})
			.resize(width, height, { fit: "fill" })
			.toColourspace("b-w")
			.raw()
			.toBuffer();
		const rgba = Buffer.alloc(width * height * 4);
		for (let i = 0; i < mask.length; i++) {
			const input = i * channels;
			const output = i * 4;
			rgba[output] = photo.data[input] as number;
			rgba[output + 1] = photo.data[input + 1] as number;
			rgba[output + 2] = photo.data[input + 2] as number;
			rgba[output + 3] = mask[i] as number;
		}
		return {
			data: rgba,
			info: { ...photo.info, channels: 4, size: rgba.length },
		};
	} catch (error) {
		console.warn("[photos] Background removal failed", error);
		return null;
	}
}
