import { Resend } from "resend";
import type { RequestContext } from "@/lib/context/types";

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

	async send(params: {
		from: string;
		to: string;
		subject: string;
		html: string;
		text?: string;
	}): Promise<void> {
		const key = this.getResendApiKey();
		if (!key) {
			throw new Error("RESEND_API_KEY is not configured.");
		}
		const resend = new Resend(key);
		const result = await resend.emails.send({
			from: params.from,
			to: params.to,
			subject: params.subject,
			html: params.html,
			...(params.text ? { text: params.text } : {}),
		});
		if (result.error) {
			const { message, statusCode, name } = result.error;
			throw new Error(
				`Resend error (${name}${statusCode != null ? ` ${statusCode}` : ""}): ${message}`
			);
		}
	}
}
