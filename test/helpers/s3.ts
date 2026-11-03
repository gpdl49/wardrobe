import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	NoSuchKey,
	NotFound,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { createS3Client, setS3Client } from "@/lib/s3";

export type StoredObject = {
	body: Uint8Array;
	contentType: string | undefined;
};

/**
 * An in-memory S3 for tests: a real client (so presigning works offline)
 * whose `send` serves Head/Get/Put/DeleteObjects from a Map keyed by object
 * key. Installed as the app's client until `restore()`.
 */
export function installFakeS3() {
	const objects = new Map<string, StoredObject>();
	const client: S3Client = createS3Client({
		AWS_REGION: "eu-central-1",
		AWS_ACCESS_KEY_ID: "AKIAFAKE",
		AWS_SECRET_ACCESS_KEY: "fake-secret",
		S3_ENDPOINT: undefined,
	});
	const metadata = { httpStatusCode: 404 };
	// biome-ignore lint/suspicious/noExplicitAny: dispatching on command classes
	client.send = (async (command: any) => {
		const key: string | undefined = command.input.Key;
		if (command instanceof HeadObjectCommand) {
			const object = key ? objects.get(key) : undefined;
			if (!object) {
				throw new NotFound({ message: "Not Found", $metadata: metadata });
			}
			return {
				ContentLength: object.body.byteLength,
				ContentType: object.contentType,
			};
		}
		if (command instanceof GetObjectCommand) {
			const object = key ? objects.get(key) : undefined;
			if (!object) {
				throw new NoSuchKey({ message: "No such key", $metadata: metadata });
			}
			return {
				ContentType: object.contentType,
				Body: { transformToByteArray: async () => object.body },
			};
		}
		if (command instanceof PutObjectCommand) {
			objects.set(key as string, {
				body: command.input.Body as Uint8Array,
				contentType: command.input.ContentType,
			});
			return {};
		}
		if (command instanceof DeleteObjectsCommand) {
			for (const { Key } of command.input.Delete?.Objects ?? []) {
				if (Key) {
					objects.delete(Key);
				}
			}
			return {};
		}
		throw new Error(`Fake S3 does not handle ${command.constructor.name}`);
	}) as S3Client["send"];
	setS3Client(client);
	return {
		objects,
		client,
		/** What a browser PUT to the presigned URL would store. */
		upload(key: string, body: Uint8Array, contentType = "image/jpeg") {
			objects.set(key, { body, contentType });
		},
		restore() {
			setS3Client(undefined);
		},
	};
}

export type FakeS3 = ReturnType<typeof installFakeS3>;
