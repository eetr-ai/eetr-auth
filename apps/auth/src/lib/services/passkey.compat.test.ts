import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";

import type { PasskeyCredentialRow, PasskeyRepository } from "@/lib/repositories/passkey.repository";
import type { UserRepository } from "@/lib/repositories/admin.repository";
import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import { PasskeyService } from "@/lib/services/passkey.service";

// Unlike passkey.service.test.ts, nothing here is mocked: we sign a real WebAuthn assertion
// and let simplewebauthn verify it, so a library upgrade that misreads stored credentials
// fails here instead of locking users out in production.

const ORIGIN = "https://auth.example.com";
const RP_ID = "auth.example.com";

function sha256(data: Buffer): Buffer {
	return createHash("sha256").update(data).digest();
}

/** An ES256 authenticator plus the credential row exactly as simplewebauthn v9 stored it. */
function makeV9Credential() {
	const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
	const jwk = publicKey.export({ format: "jwk" });
	// COSE_Key for ES256 (RFC 9053): kty EC2, alg -7, crv P-256, x, y.
	const coseKey = isoCBOR.encode(
		new Map<number, number | Uint8Array>([
			[1, 2],
			[3, -7],
			[-1, 1],
			[-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
			[-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
		])
	);
	const rawId = randomBytes(16);
	// v9's verifyAndStoreRegistration wrote Buffer.from(credentialID/credentialPublicKey).toString("base64url").
	const row: PasskeyCredentialRow = {
		id: "row-1",
		userId: "user-1",
		credentialId: Buffer.from(rawId).toString("base64url"),
		publicKey: Buffer.from(coseKey).toString("base64url"),
		counter: 3,
		deviceType: "multiDevice",
		backedUp: true,
		transports: JSON.stringify(["internal", "hybrid"]),
		name: null,
		lastUsedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	return { privateKey, row };
}

function signAssertion(
	privateKey: KeyObject,
	credentialId: string,
	challenge: string,
	counter: number
): AuthenticationResponseJSON {
	const clientDataJSON = Buffer.from(
		JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN, crossOrigin: false })
	);
	const counterBytes = Buffer.alloc(4);
	counterBytes.writeUInt32BE(counter);
	// rpIdHash || flags (user present + user verified) || signCount
	const authenticatorData = Buffer.concat([sha256(Buffer.from(RP_ID)), Buffer.from([0x05]), counterBytes]);
	const signature = sign("sha256", Buffer.concat([authenticatorData, sha256(clientDataJSON)]), {
		key: privateKey,
		dsaEncoding: "der",
	});
	return {
		id: credentialId,
		rawId: credentialId,
		type: "public-key",
		clientExtensionResults: {},
		response: {
			clientDataJSON: clientDataJSON.toString("base64url"),
			authenticatorData: authenticatorData.toString("base64url"),
			signature: signature.toString("base64url"),
		},
	};
}

function makeService(row: PasskeyCredentialRow, challenge: string) {
	const repo = {
		getChallengeById: vi.fn().mockResolvedValue({
			id: "challenge-1",
			userId: null,
			challenge,
			kind: "authentication",
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		}),
		findCredentialById: vi.fn().mockImplementation(async (id: string) => (id === row.credentialId ? row : null)),
		updateCredentialCounter: vi.fn(),
		deleteChallenge: vi.fn(),
		insertExchangeToken: vi.fn(),
	} as unknown as PasskeyRepository;
	const siteRepo = { get: vi.fn().mockResolvedValue(null) } as unknown as SiteSettingsRepository;
	const service = new PasskeyService({
		repo,
		userRepo: {} as UserRepository,
		siteRepo,
		env: { ISSUER_BASE_URL: ORIGIN } as unknown as CloudflareEnv,
	});
	return { service, repo };
}

describe("passkeys stored by simplewebauthn v9", () => {
	it("still verify sign-in assertions after the v14 upgrade", async () => {
		const { privateKey, row } = makeV9Credential();
		const challenge = Buffer.from("challenge-from-v14").toString("base64url");
		const { service, repo } = makeService(row, challenge);

		const result = await service.verifyAuthentication(
			"challenge-1",
			signAssertion(privateKey, row.credentialId, challenge, 4)
		);

		expect(result.userId).toBe("user-1");
		expect(repo.updateCredentialCounter).toHaveBeenCalledWith(row.credentialId, 4, expect.any(String));
	});

	it("rejects an assertion signed by a different key", async () => {
		const { row } = makeV9Credential();
		const { privateKey: otherKey } = makeV9Credential();
		const challenge = Buffer.from("challenge-from-v14").toString("base64url");
		const { service, repo } = makeService(row, challenge);

		await expect(
			service.verifyAuthentication("challenge-1", signAssertion(otherKey, row.credentialId, challenge, 4))
		).rejects.toThrow();
		expect(repo.insertExchangeToken).not.toHaveBeenCalled();
	});

	it("rejects a replayed counter", async () => {
		const { privateKey, row } = makeV9Credential();
		const challenge = Buffer.from("challenge-from-v14").toString("base64url");
		const { service } = makeService(row, challenge);

		// The stored counter is 3, so an authenticator reporting 2 looks cloned.
		await expect(
			service.verifyAuthentication("challenge-1", signAssertion(privateKey, row.credentialId, challenge, 2))
		).rejects.toThrow();
	});
});
