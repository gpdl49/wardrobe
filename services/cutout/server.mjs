import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";

/**
 * POST /mask with image bytes (JPEG, PNG or WebP) returns the garment's
 * foreground mask as an 8-bit greyscale PNG at the model's 1024×1024; the
 * caller stretches it back over the photo. GET /healthz answers once the
 * model is loaded. One request runs at a time to bound memory.
 */

const EDGE = 1024;
const PIXELS = EDGE * EDGE;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const MAX_BYTES = 30 * 1024 * 1024;
const PORT = Number(process.env.PORT ?? 8080);
const THREADS = Number(process.env.CUTOUT_THREADS ?? 4);
const MODEL = fileURLToPath(new URL("./models/birefnet.onnx", import.meta.url));

sharp.cache(false);
sharp.concurrency(1);

const session = await ort.InferenceSession.create(MODEL, {
	intraOpNumThreads: THREADS,
	interOpNumThreads: 1,
	executionMode: "sequential",
	// The arena keeps every block it grows to (~9 GiB after one pass, another
	// ~8 GiB reserved in the next); without it a pass peaks at ~7.7 GiB and
	// memory returns to ~1.7 GiB between photos.
	enableCpuMemArena: false,
});
const inputName = session.inputNames[0];
const outputName = session.outputNames.at(-1);

/** @param {Buffer} image */
export async function mask(image) {
	const rgb = await sharp(image, { failOn: "error" })
		.autoOrient()
		.removeAlpha()
		.toColourspace("srgb")
		.resize(EDGE, EDGE, { fit: "fill" })
		.raw()
		.toBuffer();
	const tensor = new Float32Array(PIXELS * 3);
	for (let c = 0; c < 3; c++) {
		for (let i = 0; i < PIXELS; i++) {
			tensor[c * PIXELS + i] = (rgb[i * 3 + c] / 255 - MEAN[c]) / STD[c];
		}
	}
	const results = await session.run({
		[inputName]: new ort.Tensor("float32", tensor, [1, 3, EDGE, EDGE]),
	});
	const logits = results[outputName].data;
	const alpha = Buffer.alloc(PIXELS);
	for (let i = 0; i < PIXELS; i++) {
		alpha[i] = Math.round(255 / (1 + Math.exp(-logits[i])));
	}
	return sharp(alpha, { raw: { width: EDGE, height: EDGE, channels: 1 } })
		.toColourspace("b-w")
		.png()
		.toBuffer();
}

let queue = Promise.resolve();

/** @param {import("node:http").IncomingMessage} request */
async function readBody(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > MAX_BYTES)
			throw Object.assign(new Error("Too large"), { status: 413 });
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
	try {
		if (request.method === "GET" && request.url === "/healthz") {
			response.writeHead(200, { "content-type": "text/plain" }).end("ok");
			return;
		}
		if (request.method !== "POST" || request.url !== "/mask") {
			response.writeHead(404).end();
			return;
		}
		const body = await readBody(request);
		const run = queue.then(() => mask(body));
		queue = run.catch(() => {});
		const png = await run;
		response.writeHead(200, { "content-type": "image/png" }).end(png);
	} catch (error) {
		const status = error?.status ?? 422;
		console.warn(`[cutout] ${status}: ${error?.message ?? error}`);
		response
			.writeHead(status, { "content-type": "text/plain" })
			.end(String(error?.message ?? error));
	}
});
server.requestTimeout = 120_000;
server.listen(PORT, () => {
	console.info(`[cutout] listening on :${PORT} with ${THREADS} threads`);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
