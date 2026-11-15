import { describe, expect, it, vi } from "vitest";
import {
	createS3Client,
	deleteObjects,
	photoKey,
	presignGet,
	presignPut,
} from "@/lib/s3";
import { installFakeS3 } from "@/test/helpers/s3";

const credentials = {
	AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
	AWS_SECRET_ACCESS_KEY: "secret",
};

it("rejects per-object errors in a successful batch delete response", async () => {
	const fake = installFakeS3();
	vi.spyOn(fake.client, "send").mockResolvedValueOnce({
		Errors: [{ Key: "photos/p/original", Code: "AccessDenied" }],
	} as never);
	try {
		await expect(deleteObjects(["photos/p/original"])).rejects.toThrow();
	} finally {
		fake.restore();
		vi.restoreAllMocks();
	}
});

describe("photoKey", () => {
	it("follows the contract layout", () => {
		expect(photoKey("p1", "original")).toBe("photos/p1/original");
		expect(photoKey("p1", "display")).toBe("photos/p1/display.webp");
		expect(photoKey("p1", "thumb")).toBe("photos/p1/thumb.webp");
	});
});

describe("presigning", () => {
	it("uses path-style URLs on a custom endpoint (MinIO)", async () => {
		const client = createS3Client({
			AWS_REGION: "eu-central-1",
			S3_ENDPOINT: "http://localhost:9000",
			...credentials,
		});
		const url = new URL(
			await presignGet("photos/p1/thumb.webp", {
				client,
				bucket: "wardrobe-test",
			}),
		);
		expect(url.origin).toBe("http://localhost:9000");
		expect(url.pathname).toBe("/wardrobe-test/photos/p1/thumb.webp");
		expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
	});

	it("uses virtual-hosted URLs on AWS", async () => {
		const client = createS3Client({
			AWS_REGION: "eu-central-1",
			...credentials,
		});
		const url = new URL(
			await presignGet("k", { client, bucket: "wardrobe-test" }),
		);
		expect(url.hostname).toBe("wardrobe-test.s3.eu-central-1.amazonaws.com");
	});

	it("presigns PUTs a browser can satisfy", async () => {
		const client = createS3Client({
			AWS_REGION: "eu-central-1",
			...credentials,
		});
		const put = await presignPut("photos/p1/original", "image/jpeg", {
			client,
			bucket: "wardrobe-test",
		});
		const url = new URL(put.url);
		expect(put.headers).toEqual({ "Content-Type": "image/jpeg" });
		expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
			"content-type",
		);
		// No flexible-checksum parameters the browser cannot compute.
		expect([...url.searchParams.keys()].some((k) => /checksum/i.test(k))).toBe(
			false,
		);
	});
});
