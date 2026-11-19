import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	NotFound,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type Env, env } from "@/lib/env";

/**
 * Photo storage. Object keys are the contract in docs/wardrobe.md
 * ("Object keys"); always build them with photoKey().
 */
export const PHOTO_VARIANTS = [
	"original",
	"display",
	"thumb",
	"cutout-display",
	"cutout-thumb",
] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export function photoKey(photoId: string, variant: PhotoVariant): string {
	return `photos/${photoId}/${variant === "original" ? variant : `${variant}.webp`}`;
}

type S3Config = Pick<
	Env,
	"AWS_REGION" | "AWS_ACCESS_KEY_ID" | "AWS_SECRET_ACCESS_KEY" | "S3_ENDPOINT"
>;

/** Pure: a client for the given config. S3_ENDPOINT (MinIO) means path-style. */
export function createS3Client(config: S3Config): S3Client {
	return new S3Client({
		region: config.AWS_REGION,
		...(config.S3_ENDPOINT
			? { endpoint: config.S3_ENDPOINT, forcePathStyle: true }
			: {}),
		...(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
			? {
					credentials: {
						accessKeyId: config.AWS_ACCESS_KEY_ID,
						secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
					},
				}
			: {}),
		// The SDK's default flexible checksums would add x-amz-checksum-* query
		// parameters to presigned PUTs that a browser upload cannot satisfy.
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
}

let client: S3Client | undefined;

export function s3(): S3Client {
	client ??= createS3Client(env());
	return client;
}

/** Tests only: use this client (e.g. one with a stubbed `send`); undefined resets. */
export function setS3Client(override: S3Client | undefined): void {
	client = override;
}

export type PresignedPut = {
	url: string;
	/** Headers the browser must send with the PUT (they are signed). */
	headers: Record<string, string>;
	expiresIn: number;
};

export async function presignPut(
	key: string,
	contentType: string,
	options: { expiresIn?: number; client?: S3Client; bucket?: string } = {},
): Promise<PresignedPut> {
	const expiresIn = options.expiresIn ?? UPLOAD_URL_TTL_SECONDS;
	const url = await getSignedUrl(
		options.client ?? s3(),
		new PutObjectCommand({
			Bucket: options.bucket ?? env().PHOTO_BUCKET,
			Key: key,
			ContentType: contentType,
		}),
		// Sign Content-Type so the upload must be the declared type.
		{ expiresIn, signableHeaders: new Set(["content-type"]) },
	);
	return { url, headers: { "Content-Type": contentType }, expiresIn };
}

export async function presignGet(
	key: string,
	options: { expiresIn?: number; client?: S3Client; bucket?: string } = {},
): Promise<string> {
	return getSignedUrl(
		options.client ?? s3(),
		new GetObjectCommand({
			Bucket: options.bucket ?? env().PHOTO_BUCKET,
			Key: key,
		}),
		{ expiresIn: options.expiresIn ?? DOWNLOAD_URL_TTL_SECONDS },
	);
}

/** Server-side read (rendition and analysis jobs). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
	const response = await s3().send(
		new GetObjectCommand({ Bucket: env().PHOTO_BUCKET, Key: key }),
	);
	if (!response.Body) {
		throw new Error(`Empty body for s3://${env().PHOTO_BUCKET}/${key}`);
	}
	return response.Body.transformToByteArray();
}

/** Server-side write (renditions). */
export async function putObject(
	key: string,
	body: Uint8Array,
	contentType: string,
): Promise<void> {
	await s3().send(
		new PutObjectCommand({
			Bucket: env().PHOTO_BUCKET,
			Key: key,
			Body: body,
			ContentType: contentType,
		}),
	);
}

/** Deletes up to 1000 keys per request; missing keys are not an error. */
export async function deleteObjects(keys: string[]): Promise<void> {
	for (let i = 0; i < keys.length; i += 1000) {
		const batch = keys.slice(i, i + 1000);
		const result = await s3().send(
			new DeleteObjectsCommand({
				Bucket: env().PHOTO_BUCKET,
				Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
			}),
		);
		if (result.Errors?.length) {
			throw new Error(
				`Object deletion failed for ${result.Errors.length} object(s)`,
			);
		}
	}
}

/** Every object key a photo may have. */
export const allPhotoKeys = (photoId: string) =>
	PHOTO_VARIANTS.map((variant) => photoKey(photoId, variant));

export type ObjectHead = { size: number; contentType: string | undefined };

/** Server-side HEAD (upload completion); null when the object does not exist. */
export async function headObject(key: string): Promise<ObjectHead | null> {
	try {
		const response = await s3().send(
			new HeadObjectCommand({ Bucket: env().PHOTO_BUCKET, Key: key }),
		);
		return {
			size: response.ContentLength ?? 0,
			contentType: response.ContentType,
		};
	} catch (err) {
		if (
			err instanceof NotFound ||
			(err as { $metadata?: { httpStatusCode?: number } }).$metadata
				?.httpStatusCode === 404
		) {
			return null;
		}
		throw err;
	}
}
