import { describe, expect, it } from "vitest";
import {
	apiKeyCreatedBodyHtml,
	buildTransactionalEmailHtml,
	emailVerificationBodyHtml,
	escapeHtml,
	mfaOtpBodyHtml,
	passwordResetBodyHtml,
} from "@/lib/email/transactional-html";

describe("escapeHtml", () => {
	it("escapes ampersands", () => {
		expect(escapeHtml("a & b")).toBe("a &amp; b");
	});

	it("escapes less-than and greater-than", () => {
		expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
	});

	it("escapes double quotes", () => {
		expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
	});

	it("returns the string unchanged when there is nothing to escape", () => {
		expect(escapeHtml("Hello world")).toBe("Hello world");
	});
});

describe("buildTransactionalEmailHtml", () => {
	it("includes the heading in the output", () => {
		const html = buildTransactionalEmailHtml({
			heading: "My Heading",
			logoUrl: "https://cdn.example.com/logo.png",
			logoAlt: "My Logo",
			bodyHtml: "<p>Body content</p>",
		});
		expect(html).toContain("My Heading");
		expect(html).toContain("<p>Body content</p>");
	});

	it("uses the provided footerLine when given", () => {
		const html = buildTransactionalEmailHtml({
			heading: "Auth",
			logoUrl: "https://cdn.example.com/logo.png",
			logoAlt: "Auth",
			bodyHtml: "<p>Hi</p>",
			footerLine: "Custom footer text.",
		});
		expect(html).toContain("Custom footer text.");
	});

	it("falls back to the default footer when footerLine is not provided", () => {
		const html = buildTransactionalEmailHtml({
			heading: "Auth Service",
			logoUrl: "https://cdn.example.com/logo.png",
			logoAlt: "Auth",
			bodyHtml: "<p>Hi</p>",
		});
		expect(html).toContain("This message was sent by Auth Service.");
	});

	it("escapes HTML in the heading to prevent XSS", () => {
		const html = buildTransactionalEmailHtml({
			heading: "<script>alert(1)</script>",
			logoUrl: "https://cdn.example.com/logo.png",
			logoAlt: "Logo",
			bodyHtml: "",
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("escapes the logo URL", () => {
		const html = buildTransactionalEmailHtml({
			heading: "Auth",
			logoUrl: 'https://cdn.example.com/logo.png"onload="alert(1)',
			logoAlt: "Logo",
			bodyHtml: "",
		});
		expect(html).toContain("&quot;");
	});
});

describe("mfaOtpBodyHtml", () => {
	it("includes the OTP code in the output", () => {
		const html = mfaOtpBodyHtml("123456");
		expect(html).toContain("123456");
		expect(html).toContain("expires in 10 minutes");
	});

	it("escapes HTML in the code", () => {
		const html = mfaOtpBodyHtml('<img src="x">');
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});
});

describe("emailVerificationBodyHtml", () => {
	it("includes the verification code", () => {
		const html = emailVerificationBodyHtml("654321");
		expect(html).toContain("654321");
		expect(html).toContain("verify your email");
	});

	it("includes the expiry notice", () => {
		const html = emailVerificationBodyHtml("000000");
		expect(html).toContain("expires in 10 minutes");
	});
});

describe("passwordResetBodyHtml", () => {
	it("includes the reset URL as a link and as plain text", () => {
		const html = passwordResetBodyHtml("https://auth.example.com/reset?token=abc", "https://auth.example.com/cancel?token=abc", 60);
		expect(html).toContain("https://auth.example.com/reset?token=abc");
		expect(html).toContain("https://auth.example.com/cancel?token=abc");
	});

	it("includes the validity duration", () => {
		const html = passwordResetBodyHtml("https://auth.example.com/reset", "https://auth.example.com/cancel", 30);
		expect(html).toContain("30 minutes");
	});

	it("escapes HTML in the URLs", () => {
		const html = passwordResetBodyHtml('https://example.com/reset?t=a"b', 'https://example.com/cancel?t=a"b', 60);
		expect(html).toContain("&quot;");
	});
});

describe("apiKeyCreatedBodyHtml", () => {
	const details = {
		clientName: "CI client",
		keyId: "3f2a9c1b4d5e6f70",
		name: "deploy pipeline",
		scopes: ["read", "write"],
		expiresAt: "2027-01-01T00:00:00.000Z",
	};

	it("names the key by its public handle and lists what it can do", () => {
		const html = apiKeyCreatedBodyHtml(details);
		expect(html).toContain("3f2a9c1b4d5e6f70");
		expect(html).toContain("CI client");
		expect(html).toContain("deploy pipeline");
		expect(html).toContain("read, write");
		expect(html).toContain("2027-01-01T00:00:00.000Z");
	});

	it("spells out the absent cases rather than leaving them blank", () => {
		const html = apiKeyCreatedBodyHtml({ ...details, name: null, scopes: [], expiresAt: null });
		expect(html).toContain("never");
		expect(html).toContain("none");
		// An unnamed key omits the row entirely instead of showing an empty label.
		expect(html).not.toContain("Name");
	});

	it("tells the reader what to do if they did not create it", () => {
		// The whole point of the message: an unexpected one means the token was taken.
		expect(apiKeyCreatedBodyHtml(details)).toContain("revoke it");
	});

	it("escapes HTML in the client name", () => {
		const html = apiKeyCreatedBodyHtml({ ...details, clientName: '<img src=x onerror="a">' });
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});
});
