import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionalEmailService } from "@/lib/services/transactional-email.service";

const mockEmailsSend = vi.fn();

vi.mock("resend", () => ({
	Resend: vi.fn().mockImplementation(function () {
		return { emails: { send: mockEmailsSend } };
	}),
}));

function makeCtx(env: Record<string, unknown> = {}) {
	return { env: env as unknown as CloudflareEnv };
}

function makeService(env: Record<string, unknown> = {}) {
	return new TransactionalEmailService(makeCtx(env));
}

describe("TransactionalEmailService", () => {
	beforeEach(() => {
		mockEmailsSend.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	describe("getResendApiKey", () => {
		it("returns the key from the cloudflare env", () => {
			const service = makeService({ RESEND_API_KEY: "cf-key" });
			expect(service.getResendApiKey()).toBe("cf-key");
		});

		it("falls back to process.env when not in cloudflare env", () => {
			vi.stubEnv("RESEND_API_KEY", "proc-key");
			const service = makeService();
			expect(service.getResendApiKey()).toBe("proc-key");
		});

		it("returns null when neither env source has a key", () => {
			const service = makeService();
			expect(service.getResendApiKey()).toBeNull();
		});

		it("returns null when the key is only whitespace", () => {
			const service = makeService({ RESEND_API_KEY: "   " });
			expect(service.getResendApiKey()).toBeNull();
		});
	});

	describe("noReplyFromAddress", () => {
		it("extracts the hostname from the site URL", () => {
			const service = makeService();
			expect(service.noReplyFromAddress("https://auth.example.com")).toBe("no-reply@auth.example.com");
		});
	});

	describe("fromAddress", () => {
		it("returns the configured EMAIL_FROM_ADDRESS when valid", () => {
			const service = makeService({ EMAIL_FROM_ADDRESS: "hello@company.com" });
			expect(service.fromAddress("https://auth.example.com")).toBe("hello@company.com");
		});

		it("falls back to no-reply when EMAIL_FROM_ADDRESS is not configured", () => {
			const service = makeService();
			expect(service.fromAddress("https://auth.example.com")).toBe("no-reply@auth.example.com");
		});

		it("throws when EMAIL_FROM_ADDRESS is not a valid email", () => {
			const service = makeService({ EMAIL_FROM_ADDRESS: "not-an-email" });
			expect(() => service.fromAddress("https://auth.example.com")).toThrow(
				"EMAIL_FROM_ADDRESS must be a valid email address."
			);
		});

		it("falls back to process.env EMAIL_FROM_ADDRESS", () => {
			vi.stubEnv("EMAIL_FROM_ADDRESS", "proc@example.com");
			const service = makeService();
			expect(service.fromAddress("https://auth.example.com")).toBe("proc@example.com");
		});
	});

	describe("send", () => {
		it("throws and logs when RESEND_API_KEY is not configured", async () => {
			const service = makeService();
			await expect(
				service.send({ from: "a@b.com", to: "c@d.com", subject: "Test", html: "<p>Hi</p>" })
			).rejects.toThrow("RESEND_API_KEY is not configured.");
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("missing_resend_api_key")
			);
		});

		it("sends the email when the API key is configured", async () => {
			mockEmailsSend.mockResolvedValue({ data: { id: "msg-1" }, error: null });
			const service = makeService({ RESEND_API_KEY: "re_key" });
			await service.send({ from: "a@b.com", to: "c@d.com", subject: "Test", html: "<p>Hi</p>" });
			expect(mockEmailsSend).toHaveBeenCalledWith(
				expect.objectContaining({ from: "a@b.com", to: "c@d.com", subject: "Test" })
			);
		});

		it("includes the text field when provided", async () => {
			mockEmailsSend.mockResolvedValue({ data: { id: "msg-1" }, error: null });
			const service = makeService({ RESEND_API_KEY: "re_key" });
			await service.send({ from: "a@b.com", to: "c@d.com", subject: "Test", html: "<p>Hi</p>", text: "Hi" });
			expect(mockEmailsSend).toHaveBeenCalledWith(expect.objectContaining({ text: "Hi" }));
		});

		it("throws and logs when the Resend API returns an error", async () => {
			mockEmailsSend.mockResolvedValue({
				data: null,
				error: { name: "validation_error", statusCode: 422, message: "Invalid to" },
			});
			const service = makeService({ RESEND_API_KEY: "re_key" });
			await expect(
				service.send({ from: "a@b.com", to: "bad", subject: "Test", html: "<p>Hi</p>" })
			).rejects.toThrow("Resend error (validation_error 422): Invalid to");
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("resend_api_error")
			);
		});

		it("logs and rethrows transport errors", async () => {
			mockEmailsSend.mockRejectedValue(new Error("Network failure"));
			const service = makeService({ RESEND_API_KEY: "re_key" });
			await expect(
				service.send({ from: "a@b.com", to: "c@d.com", subject: "Test", html: "<p>Hi</p>" })
			).rejects.toThrow("Network failure");
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("resend_transport_or_unknown_error")
			);
		});

		it("masks the email addresses in logs", async () => {
			const service = makeService();
			await expect(
				service.send({ from: "sender@example.com", to: "recipient@example.com", subject: "S", html: "<p>" })
			).rejects.toThrow();
			const logged = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
			expect(logged).toContain("se***@example.com");
			expect(logged).toContain("re***@example.com");
			expect(logged).not.toContain("sender@example.com");
			expect(logged).not.toContain("recipient@example.com");
		});
	});
});
