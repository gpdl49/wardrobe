import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
	CutoutServiceError,
	removePhotoBackground,
} from "@/lib/photos/background";

const WIDTH = 300;
const HEIGHT = 400;

/** A busy, non-neutral backdrop: the local model's pre-check would refuse it. */
async function busyPhoto() {
	const data = Buffer.alloc(WIDTH * HEIGHT * 3);
	for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 256;
	return { data, info: { width: WIDTH, height: HEIGHT, channels: 3 as const } };
}

/** A 1024² service mask with an opaque box over the given share of each side. */
async function maskPng(box: {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}) {
	const edge = 1024;
	const alpha = Buffer.alloc(edge * edge);
	for (let y = Math.round(box.y0 * edge); y < Math.round(box.y1 * edge); y++) {
		alpha.fill(
			255,
			y * edge + Math.round(box.x0 * edge),
			y * edge + Math.round(box.x1 * edge),
		);
	}
	return sharp(alpha, { raw: { width: edge, height: edge, channels: 1 } })
		.png()
		.toBuffer();
}

const reply = (body: Buffer | string, status = 200) =>
	vi.fn<typeof fetch>(
		async () => new Response(new Uint8Array(Buffer.from(body)), { status }),
	);

describe("removePhotoBackground with the cutout service", () => {
	beforeEach(() => {
		process.env.CUTOUT_URL = "http://cutout.test:8080/";
		resetEnvCache();
	});

	afterEach(() => {
		process.env.CUTOUT_URL = "";
		resetEnvCache();
	});

	it("posts the photo, ignores the backdrop and crops to the garment", async () => {
		const fetchMock = reply(
			await maskPng({ x0: 0.25, x1: 0.75, y0: 0.2, y1: 0.8 }),
		);
		const photo = await busyPhoto();
		const cutout = await removePhotoBackground(
			photo as Parameters<typeof removePhotoBackground>[0],
			{ fetch: fetchMock },
		);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("http://cutout.test:8080/mask");
		expect(init?.method).toBe("POST");
		expect(
			(await sharp(Buffer.from(init?.body as Uint8Array)).metadata()).format,
		).toBe("jpeg");
		expect(cutout?.info.channels).toBe(4);
		// 150×240 garment plus margins, framed at 4:5.
		expect((cutout?.info.width ?? 0) / (cutout?.info.height ?? 1)).toBeCloseTo(
			0.8,
			2,
		);
		expect(cutout?.info.height).toBeLessThan(HEIGHT);
	});

	it("returns null for an uncertain mask", async () => {
		const everything = reply(await maskPng({ x0: 0, x1: 1, y0: 0, y1: 1 }));
		const photo = await busyPhoto();
		await expect(
			removePhotoBackground(
				photo as Parameters<typeof removePhotoBackground>[0],
				{ fetch: everything },
			),
		).resolves.toBeNull();
	});

	it("throws when the service fails, so the job can retry", async () => {
		const photo = await busyPhoto();
		await expect(
			removePhotoBackground(
				photo as Parameters<typeof removePhotoBackground>[0],
				{ fetch: reply("busy", 503) },
			),
		).rejects.toBeInstanceOf(CutoutServiceError);
		const down = vi.fn<typeof fetch>(async () => {
			throw new TypeError("fetch failed");
		});
		await expect(
			removePhotoBackground(
				photo as Parameters<typeof removePhotoBackground>[0],
				{ fetch: down },
			),
		).rejects.toBeInstanceOf(CutoutServiceError);
	});
});
