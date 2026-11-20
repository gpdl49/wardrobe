import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

/**
 * Downloads BiRefNet (general, MIT) from the author's release and checks its
 * SHA-256. Runs at image build time; the service never fetches at runtime.
 */
const name = "BiRefNet-general-epoch_244.onnx";
const source = `https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/${name}`;
const sha256 =
	"58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c";
const directory = new URL("./models/", import.meta.url);
const destination = new URL("birefnet.onnx", directory);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const existing = await readFile(destination).catch((error) => {
	if (error.code === "ENOENT") return null;
	throw error;
});
if (!existing || hash(existing) !== sha256) {
	const response = await fetch(source, {
		signal: AbortSignal.timeout(10 * 60_000),
	});
	if (!response.ok) {
		throw new Error(`BiRefNet download returned HTTP ${response.status}`);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	if (hash(bytes) !== sha256) {
		throw new Error("Unexpected SHA-256 for the BiRefNet model");
	}
	await mkdir(directory, { recursive: true });
	const temporary = new URL(`birefnet.${process.pid}.tmp`, directory);
	try {
		await writeFile(temporary, bytes);
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true });
	}
	console.info("Installed the BiRefNet model");
}
