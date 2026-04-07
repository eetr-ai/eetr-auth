/** Escape text for HTML body content and attribute values. */
export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const BRAND = "#1e3a5f";
const BG_PAGE = "#f4f4f5";
const TEXT_MUTED = "#71717a";
const BORDER = "#e4e4e7";

export interface TransactionalEmailHtmlOptions {
	heading: string;
	logoUrl: string;
	logoAlt: string;
	bodyHtml: string;
	footerLine?: string;
}

/**
 * Table-based layout with inline styles for common email clients.
 */
export function buildTransactionalEmailHtml(opts: TransactionalEmailHtmlOptions): string {
	const { heading, logoUrl, logoAlt, bodyHtml, footerLine } = opts;
	const foot =
		footerLine?.trim() ??
		`This message was sent by ${heading}. If you did not expect it, you can ignore this email.`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BG_PAGE};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="border-top:4px solid ${BRAND};padding:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:28px 28px 8px;">
                    <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(logoAlt)}" width="168" style="max-width:168px;width:168px;height:auto;display:block;border:0;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.55;color:#18181b;">
                    <h1 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#0a0a0a;letter-spacing:-0.02em;line-height:1.3;">${escapeHtml(heading)}</h1>
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.5;color:${TEXT_MUTED};max-width:520px;margin:20px auto 0;padding:0 8px;text-align:center;">${escapeHtml(foot)}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function mfaOtpBodyHtml(code: string): string {
	return `<p style="margin:0 0 16px;">Your verification code is:</p>
<p style="margin:0 0 20px;font-size:32px;letter-spacing:0.25em;font-weight:700;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${escapeHtml(code)}</p>
<p style="margin:0;color:${TEXT_MUTED};font-size:14px;">This code expires in 10 minutes.</p>`;
}

export function emailVerificationBodyHtml(code: string): string {
  return `<p style="margin:0 0 16px;">Use this code to verify your email address:</p>
<p style="margin:0 0 20px;font-size:32px;letter-spacing:0.25em;font-weight:700;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${escapeHtml(code)}</p>
<p style="margin:0 0 12px;color:${TEXT_MUTED};font-size:14px;">This code expires in 10 minutes.</p>
<p style="margin:0;color:${TEXT_MUTED};font-size:14px;">Once verified, you can keep using this address for sign-in and account notifications.</p>`;
}

export function passwordResetBodyHtml(
	resetUrl: string,
	cancelUrl: string,
	validMinutes: number
): string {
	const safeUrl = escapeHtml(resetUrl);
	const safeCancel = escapeHtml(cancelUrl);
	return `<p style="margin:0 0 20px;">We received a request to reset your password. Use the button below — the link is valid for <strong>${validMinutes} minutes</strong>.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
  <tr>
    <td style="border-radius:8px;background-color:${BRAND};">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;">Reset password</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px;font-size:14px;color:${TEXT_MUTED};line-height:1.5;">If you did not request this, use the link below to invalidate the reset link and remove it from our system.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
  <tr>
    <td style="border-radius:8px;border:1px solid ${BORDER};background-color:#fafafa;">
      <a href="${safeCancel}" style="display:inline-block;padding:10px 24px;font-weight:600;font-size:14px;color:${BRAND};text-decoration:none;font-family:system-ui,-apple-system,sans-serif;">I didn’t request this — cancel reset</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 12px;font-size:13px;color:${TEXT_MUTED};word-break:break-all;line-height:1.45;">If the reset button does not work, copy and paste this URL into your browser:<br /><span style="color:#3f3f46;">${safeUrl}</span></p>
<p style="margin:0;font-size:12px;color:${TEXT_MUTED};word-break:break-all;line-height:1.45;">Cancel link:<br /><span style="color:#3f3f46;">${safeCancel}</span></p>`;
}
