import type { ReaderOptions } from "zxing-wasm/reader";

/**
 * zxing-wasm QR reader, loaded on first use. The .wasm is bundled and served
 * from our origin (not the library's default jsDelivr URL), so scanning works
 * on flaky Wi-Fi once cached and needs no third-party host in the CSP.
 * iOS Safari has no BarcodeDetector, hence WebAssembly.
 */
const WASM_URL = new URL("zxing-wasm/reader/zxing_reader.wasm", import.meta.url)
	.href;

const OPTIONS: ReaderOptions = {
	formats: ["QRCode"],
	tryHarder: true,
	maxNumberOfSymbols: 1,
};

/** One object: zxing-wasm re-instantiates when the overrides change. */
const OVERRIDES = {
	locateFile: (path: string, prefix: string) =>
		path.endsWith(".wasm") ? WASM_URL : prefix + path,
};

let reader: Promise<typeof import("zxing-wasm/reader")> | undefined;

function load() {
	reader ??= import("zxing-wasm/reader").then((mod) => {
		mod.prepareZXingModule({ overrides: OVERRIDES });
		return mod;
	});
	return reader;
}

/** Starts downloading and compiling the reader before the camera is up. */
export function preloadReader(): void {
	load()
		.then((mod) =>
			mod.prepareZXingModule({ overrides: OVERRIDES, fireImmediately: true }),
		)
		// A failed preload is retried by the first real read.
		.catch(() => undefined);
}

/** Text of the first QR code in a frame or photo, or null. */
export async function readQr(input: ImageData | Blob): Promise<string | null> {
	const { readBarcodes } = await load();
	const results = await readBarcodes(input, OPTIONS);
	return results.find((r) => r.isValid)?.text ?? null;
}
