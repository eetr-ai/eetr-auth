import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
	type VerifyRegistrationResponseOpts,
	type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import type {
	RegistrationResponseJSON,
	AuthenticationResponseJSON,
	AuthenticatorDevice,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import { getDb } from "@/lib/db";
import type { RequestContext } from "@/lib/context/types";
import { PasskeyRepositoryD1 } from "@/lib/repositories/passkey.repository.d1";
import { UserRepositoryD1 } from "@/lib/repositories/admin.repository.d1";
import { SiteSettingsRepositoryD1 } from "@/lib/repositories/site-settings.repository.d1";
import { resolveIssuerBaseUrl } from "@/lib/config/issuer-base-url";
import type { PasskeyCredentialRow } from "@/lib/repositories/passkey.repository";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const EXCHANGE_TOKEN_TTL_MS = 2 * 60 * 1000; // 2 minutes

function log(payload: Record<string, unknown>): void {
	console.info(JSON.stringify({ event: "passkey", ts: new Date().toISOString(), ...payload }));
}

/** Strips the protocol and any trailing slashes to get a valid WebAuthn RP ID. */
function rpIdFromOrigin(origin: string): string {
	return origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export class PasskeyService {
	private readonly repo: PasskeyRepositoryD1;
	private readonly userRepo: UserRepositoryD1;
	private readonly siteRepo: SiteSettingsRepositoryD1;
	private readonly env: Record<string, unknown>;

	constructor(ctx: RequestContext) {
		const db = getDb(ctx.env);
		this.repo = new PasskeyRepositoryD1(db);
		this.userRepo = new UserRepositoryD1(db);
		this.siteRepo = new SiteSettingsRepositoryD1(db);
		this.env = ctx.env as unknown as Record<string, unknown>;
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private async getRpDetails(): Promise<{ rpId: string; rpName: string; origin: string }> {
		const issuer = resolveIssuerBaseUrl(this.env);
		const rpId = rpIdFromOrigin(issuer);
		const site = await this.siteRepo.get();
		const rpName = site?.siteTitle?.trim() || rpId;
		return { rpId, rpName, origin: issuer };
	}

	// ── Registration ──────────────────────────────────────────────────────────

	/**
	 * Step 1 (admin API / settings): create a WebAuthn registration challenge for a user.
	 * Returns the options to pass to `startRegistration()` on the client and a
	 * `challengeId` to submit with the registration response.
	 */
	async generateRegistrationChallenge(userId: string): Promise<{
		challengeId: string;
		options: PublicKeyCredentialCreationOptionsJSON;
	}> {
		const user = await this.userRepo.getById(userId);
		if (!user) throw new Error("User not found");

		const { rpId, rpName } = await this.getRpDetails();

		// Exclude credentials the user already has
		const existing = await this.repo.findCredentialsByUserId(userId);
		const excludeCredentials = existing.map((c) => ({
			id: Buffer.from(c.credentialId, "base64url"),
			type: "public-key" as const,
			transports: c.transports
				? (JSON.parse(c.transports) as AuthenticatorTransport[])
				: undefined,
		}));

		const options = await generateRegistrationOptions({
			rpName,
			rpID: rpId,
			userName: user.username,
			userDisplayName: user.name ?? user.username,
			userID: user.id,
			attestationType: "none",
			excludeCredentials,
			authenticatorSelection: {
				residentKey: "preferred",
				userVerification: "preferred",
			},
		});

		const challengeId = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

		await this.repo.insertChallenge({
			id: challengeId,
			userId,
			challenge: options.challenge,
			kind: "registration",
			expiresAt,
		});

		log({ action: "registration_challenge_created", userId, challengeId, rpId });
		return { challengeId, options };
	}

	/**
	 * Step 2 (admin API / settings): verify the browser's registration response and
	 * persist the credential. Returns the stored credential row.
	 */
	async verifyAndStoreRegistration(
		userId: string,
		challengeId: string,
		response: RegistrationResponseJSON
	): Promise<PasskeyCredentialRow> {
		const challengeRow = await this.repo.getChallengeById(challengeId);
		if (!challengeRow || challengeRow.kind !== "registration" || challengeRow.userId !== userId) {
			throw new Error("Invalid or expired registration challenge.");
		}
		if (challengeRow.expiresAt <= new Date().toISOString()) {
			await this.repo.deleteChallenge(challengeId);
			throw new Error("Registration challenge has expired.");
		}

		const { rpId, origin } = await this.getRpDetails();

		const opts: VerifyRegistrationResponseOpts = {
			response,
			expectedChallenge: challengeRow.challenge,
			expectedOrigin: origin,
			expectedRPID: rpId,
			requireUserVerification: false,
		};

		const { verified, registrationInfo } = await verifyRegistrationResponse(opts);

		if (!verified || !registrationInfo) {
			log({ action: "registration_verify_failed", userId, challengeId });
			throw new Error("Passkey registration could not be verified.");
		}

		const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = registrationInfo;

		const credentialRow: PasskeyCredentialRow = {
			id: crypto.randomUUID(),
			userId,
			credentialId: Buffer.from(credentialID).toString("base64url"),
			publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
			counter,
			deviceType: credentialDeviceType,
			backedUp: credentialBackedUp,
			transports: response.response.transports ? JSON.stringify(response.response.transports) : null,
			createdAt: new Date().toISOString(),
		};

		await this.repo.insertCredential(credentialRow);
		await this.repo.deleteChallenge(challengeId);

		log({
			action: "registration_complete",
			userId,
			credentialId: credentialRow.credentialId,
			deviceType: credentialDeviceType,
			backedUp: credentialBackedUp,
		});

		return credentialRow;
	}

	// ── Authentication ────────────────────────────────────────────────────────

	/**
	 * Step 1 (sign-in): create a discoverable-credential authentication challenge.
	 * No user required — the device will select the right credential.
	 */
	async generateAuthenticationChallenge(): Promise<{
		challengeId: string;
		options: PublicKeyCredentialRequestOptionsJSON;
	}> {
		const { rpId } = await this.getRpDetails();

		const options = await generateAuthenticationOptions({
			rpID: rpId,
			userVerification: "preferred",
			allowCredentials: [], // discoverable: let the platform pick
		});

		const challengeId = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

		await this.repo.insertChallenge({
			id: challengeId,
			userId: null,
			challenge: options.challenge,
			kind: "authentication",
			expiresAt,
		});

		log({ action: "authentication_challenge_created", challengeId, rpId });
		return { challengeId, options };
	}

	/**
	 * Step 2 (sign-in): verify the authentication response and issue a single-use
	 * exchange token that the client can pass to NextAuth.
	 */
	async verifyAuthentication(
		challengeId: string,
		response: AuthenticationResponseJSON
	): Promise<{ exchangeToken: string; userId: string }> {
		const challengeRow = await this.repo.getChallengeById(challengeId);
		if (!challengeRow || challengeRow.kind !== "authentication") {
			throw new Error("Invalid or expired authentication challenge.");
		}
		if (challengeRow.expiresAt <= new Date().toISOString()) {
			await this.repo.deleteChallenge(challengeId);
			throw new Error("Authentication challenge has expired.");
		}

		const credentialRow = await this.repo.findCredentialById(response.id);
		if (!credentialRow) {
			throw new Error("Passkey not found.");
		}

		const { rpId, origin } = await this.getRpDetails();

		const authenticator: AuthenticatorDevice = {
			credentialID: Buffer.from(credentialRow.credentialId, "base64url"),
			credentialPublicKey: Buffer.from(credentialRow.publicKey, "base64url"),
			counter: credentialRow.counter,
			transports: credentialRow.transports
				? (JSON.parse(credentialRow.transports) as AuthenticatorTransport[])
				: undefined,
		};

		const opts: VerifyAuthenticationResponseOpts = {
			response,
			expectedChallenge: challengeRow.challenge,
			expectedOrigin: origin,
			expectedRPID: rpId,
			requireUserVerification: false,
			authenticator,
		};

		const { verified, authenticationInfo } = await verifyAuthenticationResponse(opts);

		if (!verified) {
			log({ action: "authentication_verify_failed", challengeId, credentialId: response.id });
			throw new Error("Passkey authentication could not be verified.");
		}

		// Update the counter to prevent replay attacks
		await this.repo.updateCredentialCounter(
			credentialRow.credentialId,
			authenticationInfo.newCounter
		);
		await this.repo.deleteChallenge(challengeId);

		// Issue a short-lived single-use exchange token for NextAuth
		const exchangeToken = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + EXCHANGE_TOKEN_TTL_MS).toISOString();

		await this.repo.insertExchangeToken({
			id: exchangeToken,
			userId: credentialRow.userId,
			expiresAt,
			usedAt: null,
		});

		log({
			action: "authentication_complete",
			userId: credentialRow.userId,
			credentialId: credentialRow.credentialId,
			newCounter: authenticationInfo.newCounter,
		});

		return { exchangeToken, userId: credentialRow.userId };
	}

	// ── Exchange token (NextAuth handoff) ─────────────────────────────────────

	/**
	 * Atomically consumes the exchange token and returns the userId.
	 * Returns null if the token is missing, already used, or expired.
	 */
	async consumeExchangeToken(tokenId: string): Promise<string | null> {
		const row = await this.repo.consumeExchangeToken(tokenId);
		if (!row) {
			log({ action: "exchange_token_invalid", tokenId: tokenId.slice(0, 8) });
			return null;
		}
		log({ action: "exchange_token_consumed", userId: row.userId });
		return row.userId;
	}

	// ── Utilities ─────────────────────────────────────────────────────────────

	/** Returns true if the user has at least one registered passkey. */
	async hasPasskey(userId: string): Promise<boolean> {
		return this.repo.hasCredentialForUser(userId);
	}
}
