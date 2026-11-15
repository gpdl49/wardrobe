import { describe, expect, it } from "vitest";
import { decryptKey, encryptKey } from "./crypto";

const key = Buffer.alloc(32, 1).toString("base64");
describe("Immich key encryption", () => {
	it("round trips with a random IV", () => {
		const a = encryptKey("secret", key);
		expect(a).not.toContain("secret");
		expect(decryptKey(a, key)).toBe("secret");
		expect(encryptKey("secret", key)).not.toBe(a);
	});
	it("rejects tampering and wrong keys", () => {
		const parts = encryptKey("secret", key).split(":");
		parts[2] = Buffer.alloc(16).toString("base64url");
		expect(() => decryptKey(parts.join(":"), key)).toThrow();
		expect(() =>
			decryptKey(
				encryptKey("secret", key),
				Buffer.alloc(32, 2).toString("base64"),
			),
		).toThrow();
	});
});
