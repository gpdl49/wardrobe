import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptKey(value: string, secret: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv(
		"aes-256-gcm",
		Buffer.from(secret, "base64"),
		iv,
	);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(":");
}
export function decryptKey(value: string, secret: string): string {
	try {
		const [version, iv, tag, data, ...rest] = value.split(":");
		if (version !== "v1" || !iv || !tag || !data || rest.length)
			throw new Error();
		const decipher = createDecipheriv(
			"aes-256-gcm",
			Buffer.from(secret, "base64"),
			Buffer.from(iv, "base64url"),
		);
		decipher.setAuthTag(Buffer.from(tag, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(data, "base64url")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw new Error("Unable to decrypt Immich key");
	}
}
