import { Resend } from "resend";
import type { RequestContext } from "@/lib/context/types";

function maskEmailForLogs(email: string): string {
	const trimmed = email.trim().toLowerCase();
	const at = trimmed.indexOf("@");
	if (at <= 0 || at === trimmed.length - 1) {
		return "invalid_email";
	}
	const local = trimmed.slice(0, at);
	const domain = trimmed.slice(at + 1);
	const visibleLocal = local.length <= 2 ? `${local[0] ?? ""}*` : `${local.slice(0, 2)}***`;
	return `${visibleLocal}@${domain}`;
}

function logResendError(payload: Record<string, unknown>): void {
	console.error(JSON.stringify({ event: "transactional_email_send_failed", provider: "resend", ...payload }));
}

export class TransactionalEmailService {
	private readonly env: Record<string, unknown>;

	constructor(ctx: RequestContext) {
		this.env = ctx.env as unknown as Record<string, unknown>;
	}

	getResendApiKey(): string | null {
		const e = this.env;
		return (
			(typeof e.RESEND_API_KEY === "string" && e.RESEND_API_KEY.trim().length > 0
				? e.RESEND_API_KEY
				: null) ??
			(typeof process.env.RESEND_API_KEY === "string" && process.env.RESEND_API_KEY.trim().length > 0
				? process.env.RESEND_API_KEY
				: null)
		);
	}

	noReplyFromAddress(siteUrlHttp: string): string {
		const u = new URL(siteUrlHttp);
		return `no-reply@${u.hostname}`;
	}

	private configuredFromAddress(): string | null {
		const e = this.env;
		const value =
			(typeof e.EMAIL_FROM_ADDRESS === "string" && e.EMAIL_FROM_ADDRESS.trim().length > 0
				? e.EMAIL_FROM_ADDRESS
				: null) ??
			(typeof process.env.EMAIL_FROM_ADDRESS === "string" && process.env.EMAIL_FROM_ADDRESS.trim().length > 0
				? process.env.EMAIL_FROM_ADDRESS
				: null);
		if (!value) {
			return null;
		}
		const trimmed = value.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			throw new Error("EMAIL_FROM_ADDRESS must be a valid email address.");
		}
		return trimmed;
	}

	fromAddress(siteUrlHttp: string): string {
		return this.configuredFromAddress() ?? this.noReplyFromAddress(siteUrlHttp);
	}

	async send(params: {
		from: string;
		to: string;
		subject: string;
		html: string;
		text?: string;
	}): Promise<void> {
		const toMasked = maskEmailForLogs(params.to);
		const fromMasked = maskEmailForLogs(params.from);
		const key = this.getResendApiKey();
		if (!key) {
			logResendError({
				reason: "missing_resend_api_key",
				toMasked,
				fromMasked,
				subject: params.subject,
			});
			throw new Error("RESEND_API_KEY is not configured.");
		}
		const resend = new Resend(key);
		try {
			const result = await resend.emails.send({
				from: params.from,
				to: params.to,
				subject: params.subject,
				html: params.html,
				...(params.text ? { text: params.text } : {}),
			});
			if (result.error) {
				const { message, statusCode, name } = result.error;
				logResendError({
					reason: "resend_api_error",
					name,
					statusCode,
					message,
					toMasked,
					fromMasked,
					subject: params.subject,
				});
				throw new Error(
					`Resend error (${name}${statusCode != null ? ` ${statusCode}` : ""}): ${message}`
				);
			}
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Resend error (")) {
				throw error;
			}
			const message = error instanceof Error ? error.message : String(error);
			logResendError({
				reason: "resend_transport_or_unknown_error",
				message,
				toMasked,
				fromMasked,
				subject: params.subject,
			});
			throw error;
		}
	}
}
