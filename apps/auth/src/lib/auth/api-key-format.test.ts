import { describe, expect, it } from "vitest";

import { API_KEY_PREFIX, generateApiKey, parseApiKey } from "@/lib/auth/api-key-format";

describe("api-key-format", () => {
	describe("generateApiKey", () => {
		it("produces a credential that parses back to its own halves", () => {
			const generated = generateApiKey();
			expect(generated.presented).toBe(
				`${API_KEY_PREFIX}_${generated.keyId}_${generated.secret}`
			);
			expect(parseApiKey(generated.presented)).toEqual({
				keyId: generated.keyId,
				secret: generated.secret,
			});
		});

		it("uses a 16-hex handle and a 64-hex secret", () => {
			const { keyId, secret } = generateApiKey();
			expect(keyId).toMatch(/^[0-9a-f]{16}$/u);
			expect(secret).toMatch(/^[0-9a-f]{64}$/u);
		});

		it("does not repeat itself", () => {
			const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().presented));
			expect(keys.size).toBe(50);
		});
	});

	describe("parseApiKey", () => {
		it("tolerates surrounding whitespace, which shells and CI secrets add freely", () => {
			const generated = generateApiKey();
			expect(parseApiKey(`  ${generated.presented}\n`)).toEqual({
				keyId: generated.keyId,
				secret: generated.secret,
			});
		});

		it.each([
			["empty", ""],
			["no prefix", `${"a".repeat(16)}_${"b".repeat(64)}`],
			["wrong prefix", `zzz_${"a".repeat(16)}_${"b".repeat(64)}`],
			["too few segments", `eak_${"a".repeat(16)}`],
			["too many segments", `eak_${"a".repeat(16)}_${"b".repeat(64)}_extra`],
			["short handle", `eak_${"a".repeat(15)}_${"b".repeat(64)}`],
			["long handle", `eak_${"a".repeat(17)}_${"b".repeat(64)}`],
			["short secret", `eak_${"a".repeat(16)}_${"b".repeat(63)}`],
			["non-hex handle", `eak_${"g".repeat(16)}_${"b".repeat(64)}`],
			["non-hex secret", `eak_${"a".repeat(16)}_${"g".repeat(64)}`],
			["uppercase hex", `eak_${"A".repeat(16)}_${"B".repeat(64)}`],
			// A client secret must not be mistaken for an API key.
			["a client secret", "h1:deadbeef"],
		])("rejects %s", (_label, input) => {
			expect(parseApiKey(input)).toBeNull();
		});
	});
});
