import type { SiteSettingsRepository } from "@/lib/repositories/site-settings.repository";
import type { UserTotpRepository } from "@/lib/repositories/user-totp.repository";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { buildOtpauthUri, generateSecret, verifyTotp } from "@/lib/auth/totp";

export interface TotpServiceDeps {
	totpRepo: UserTotpRepository;
	siteRepo: SiteSettingsRepository;
}

/** Display-safe enrollment status (never exposes the secret). */
export type TotpStatus = {
	enrolled: boolean;
	createdAt: string | null;
	lastUsedAt: string | null;
};

export type TotpEnrollmentStart = {
	/** otpauth:// URI to render as a QR code. */
	otpauthUri: string;
	/** Base32 secret, shown for manual entry when the QR can't be scanned. */
	secret: string;
};

type EnrollingUser = { id: string; username: string; email?: string | null };

/**
 * Per-user authenticator-app (TOTP) MFA. Enrollment is a two-step flow: `beginEnrollment`
 * stores a pending secret and returns the QR/manual-entry data; `confirmEnrollment`
 * activates it only after the user proves they can produce a valid code.
 */
export class TotpService {
	private readonly totpRepo: UserTotpRepository;
	private readonly siteRepo: SiteSettingsRepository;

	constructor({ totpRepo, siteRepo }: TotpServiceDeps) {
		this.totpRepo = totpRepo;
		this.siteRepo = siteRepo;
	}

	/** True only for a confirmed enrollment; pending rows do not count. */
	async getStatus(userId: string): Promise<TotpStatus> {
		const row = await this.totpRepo.get(userId);
		if (!row || !row.confirmedAt) {
			return { enrolled: false, createdAt: null, lastUsedAt: null };
		}
		return { enrolled: true, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt };
	}

	async isEnrolled(userId: string): Promise<boolean> {
		return (await this.getStatus(userId)).enrolled;
	}

	async beginEnrollment(user: EnrollingUser): Promise<TotpEnrollmentStart> {
		const secret = generateSecret();
		const secretEnc = await encryptSecret(secret);
		await this.totpRepo.upsertPending({
			userId: user.id,
			secretEnc,
			createdAt: new Date().toISOString(),
		});
		const site = await this.siteRepo.get();
		const issuer = site?.siteTitle?.trim() || "Eetr Auth";
		const accountName = user.email?.trim() || user.username;
		return { otpauthUri: buildOtpauthUri({ secret, accountName, issuer }), secret };
	}

	/** Verifies the first code and activates the enrollment. Returns false on a bad code. */
	async confirmEnrollment(userId: string, code: string): Promise<boolean> {
		const row = await this.totpRepo.get(userId);
		if (!row) {
			return false;
		}
		const secret = await decryptSecret(row.secretEnc);
		if (!(await verifyTotp(secret, code))) {
			return false;
		}
		await this.totpRepo.confirm(userId, new Date().toISOString());
		return true;
	}

	async disable(userId: string): Promise<void> {
		await this.totpRepo.delete(userId);
	}

	/** Verifies a login code against a confirmed enrollment and records last-used. */
	async verifyCode(userId: string, code: string): Promise<boolean> {
		const row = await this.totpRepo.get(userId);
		if (!row || !row.confirmedAt) {
			return false;
		}
		const secret = await decryptSecret(row.secretEnc);
		if (!(await verifyTotp(secret, code))) {
			return false;
		}
		await this.totpRepo.touchLastUsed(userId, new Date().toISOString());
		return true;
	}
}
