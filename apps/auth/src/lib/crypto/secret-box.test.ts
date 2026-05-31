import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";

// AUTH_SECRET is provided by the vitest env (see vitest.config.ts).

describe("secret-box", () => {
	it("round-trips a secret through encrypt/decrypt", async () => {
		const plaintext = "JBSWY3DPEHPK3PXP";
		const decrypted = await decryptSecret(await encryptSecret(plaintext));
		expect(decrypted).toBe(plaintext);
	});

	it("produces a distinct ciphertext each time (random IV) that still decrypts", async () => {
		const plaintext = "the same secret";
		const a = await encryptSecret(plaintext);
		const b = await encryptSecret(plaintext);
		expect(a).not.toBe(b);
		expect(await decryptSecret(a)).toBe(plaintext);
		expect(await decryptSecret(b)).toBe(plaintext);
	});

	it("stores the payload as base64(iv):base64(ciphertext)", async () => {
		const payload = await encryptSecret("x");
		expect(payload.split(":")).toHaveLength(2);
	});

	it("throws on a malformed payload", async () => {
		await expect(decryptSecret("not-a-valid-payload")).rejects.toThrow(/malformed/i);
	});

	it("fails to decrypt a tampered ciphertext (AES-GCM auth tag)", async () => {
		const [iv] = (await encryptSecret("secret")).split(":");
		await expect(decryptSecret(`${iv}:${Buffer.from("garbage").toString("base64")}`)).rejects.toThrow();
	});
});
