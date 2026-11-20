import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import sharp, { type OutputInfo } from "sharp";
import { env as appEnv } from "@/lib/env";
import { type Frame, garmentFrame } from "@/lib/photos/frame";

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
let session: Promise<InferenceSession> | undefined;

async function loadModel(): Promise<InferenceSession> {
	const weights = await readFile(join(process.cwd(), "models", "u2netp.onnx"));
	env.wasm.numThreads = 1;
	return await InferenceSession.create(new Uint8Array(weights), {
		executionProviders: ["wasm"],
	});
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
	session ??= loadModel().catch((error) => {
		session = undefined;
		throw error;
	});
	const model = await session;

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
	return confidentAlpha(scores);
}

/**
 * Turns soft scores (0–1) into an alpha mask, or null when the mask is not a
 * confident single subject: too little solid garment or too little clear
 * background.
 */
function confidentAlpha(scores: ArrayLike<number>): Buffer | null {
	let solid = 0;
	let clear = 0;
	const alpha = Buffer.alloc(scores.length);
	for (let i = 0; i < scores.length; i++) {
		const score = scores[i] as number;
		if (!Number.isFinite(score)) return null;
		if (score <= CLEAR) clear++;
		if (score >= SOLID) solid++;
		const coverage = (score - CLEAR) / (SOLID - CLEAR);
		alpha[i] = Math.round(Math.max(0, Math.min(1, coverage)) * 255);
	}
	return solid >= scores.length * 0.04 && clear >= scores.length * 0.12
		? alpha
		: null;
}

/** Thrown when the cutout service fails; the job retries or records `failed`. */
export class CutoutServiceError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "CutoutServiceError";
	}
}

const SERVICE_TIMEOUT_MS = 100_000;

/**
 * Asks the cutout service (services/cutout, BiRefNet) for the garment mask.
 * It handles any backdrop, so there is no border pre-check. Returns the
 * alpha at the mask's own resolution.
 */
async function serviceMask(
	baseUrl: string,
	photo: RawPhoto,
	fetchImpl: typeof fetch,
): Promise<{ alpha: Buffer; edge: number } | null> {
	const { width, height, channels } = photo.info;
	const jpeg = await sharp(photo.data, { raw: { width, height, channels } })
		.removeAlpha()
		.jpeg({ quality: 92 })
		.toBuffer();
	let response: Response;
	try {
		response = await fetchImpl(`${baseUrl}/mask`, {
			method: "POST",
			headers: { "content-type": "image/jpeg" },
			body: new Uint8Array(jpeg),
			signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
		});
	} catch (error) {
		throw new CutoutServiceError(
			`Cutout service unreachable: ${(error as Error).message}`,
			{ cause: error },
		);
	}
	if (!response.ok) {
		throw new CutoutServiceError(
			`Cutout service returned HTTP ${response.status}`,
		);
	}
	const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
		.toColourspace("b-w")
		.raw()
		.toBuffer({ resolveWithObject: true });
	if (info.channels !== 1 || info.width !== info.height) {
		throw new CutoutServiceError("Cutout service returned an unexpected mask");
	}
	const scores = new Float32Array(data.length);
	for (let i = 0; i < data.length; i++) scores[i] = (data[i] as number) / 255;
	const alpha = confidentAlpha(scores);
	return alpha ? { alpha, edge: info.width } : null;
}

/** Crops to `frame`, padding with transparency where it leaves the image. */
async function cropToFrame(photo: RawPhoto, frame: Frame): Promise<RawPhoto> {
	const { width, height } = photo.info;
	const left = Math.max(0, frame.left);
	const top = Math.max(0, frame.top);
	const right = Math.min(width, frame.left + frame.width);
	const bottom = Math.min(height, frame.top + frame.height);
	return sharp(photo.data, { raw: { width, height, channels: 4 } })
		.extract({ left, top, width: right - left, height: bottom - top })
		.extend({
			left: left - frame.left,
			top: top - frame.top,
			right: frame.left + frame.width - right,
			bottom: frame.top + frame.height - bottom,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.raw()
		.toBuffer({ resolveWithObject: true });
}

/** The local U²-Net-P mask; only for light, neutral backdrops. */
async function localMask(
	photo: RawPhoto,
): Promise<{ alpha: Buffer; edge: number } | null> {
	const { width, height, channels } = photo.info;
	const rgb = await sharp(photo.data, { raw: { width, height, channels } })
		.removeAlpha()
		.resize(EDGE, EDGE, { fit: "fill" })
		.raw()
		.toBuffer();
	if (!lightNeutralBorder(rgb)) return null;
	const alpha = await foregroundMask(rgb);
	return alpha ? { alpha, edge: EDGE } : null;
}

/**
 * Best-effort cutout of one garment, auto-cropped to it (lib/photos/frame).
 * With CUTOUT_URL the cutout service handles any backdrop; without it the
 * local model needs a light, neutral one. Null when the mask is uncertain;
 * throws CutoutServiceError when the service fails.
 */
export async function removePhotoBackground(
	photo: RawPhoto,
	deps: { fetch?: typeof fetch } = {},
): Promise<RawPhoto | null> {
	const { width, height, channels } = photo.info;
	if (channels < 3 || hasTransparency(photo)) return null;
	const service = appEnv().CUTOUT_URL;
	const found = service
		? await serviceMask(service, photo, deps.fetch ?? fetch)
		: await localMask(photo);
	if (!found) return null;
	const { alpha, edge } = found;

	const mask = await sharp(alpha, {
		raw: { width: edge, height: edge, channels: 1 },
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
	const cutout = {
		data: rgba,
		info: { ...photo.info, channels: 4 as const, size: rgba.length },
	};
	const frame = garmentFrame(alpha, edge, edge, width, height);
	return frame ? cropToFrame(cutout, frame) : cutout;
}
