import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const source =
	"https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx";
const sha256 =
	"309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
const directory = new URL("../models/", import.meta.url);
const destination = new URL("u2netp.onnx", directory);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const existing = await readFile(destination).catch((error) => {
	if (error.code === "ENOENT") return null;
	throw error;
});

if (!existing || hash(existing) !== sha256) {
	const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
	if (!response.ok) {
		throw new Error(`Photo model download returned HTTP ${response.status}`);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	if (hash(bytes) !== sha256) {
		throw new Error("Unexpected SHA-256 for the U²-Net-P photo model");
	}
	await mkdir(directory, { recursive: true });
	const temporary = new URL(`u2netp.${process.pid}.tmp`, directory);
	try {
		await writeFile(temporary, bytes);
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true });
	}
	console.info("Installed the U²-Net-P photo model");
}
