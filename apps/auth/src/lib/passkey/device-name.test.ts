import { describe, expect, it } from "vitest";
import { deviceNameFromUserAgent } from "./device-name";

describe("deviceNameFromUserAgent", () => {
	it("falls back when the User-Agent is missing", () => {
		expect(deviceNameFromUserAgent(null)).toBe("New passkey");
		expect(deviceNameFromUserAgent(undefined)).toBe("New passkey");
		expect(deviceNameFromUserAgent("")).toBe("New passkey");
	});

	it("identifies Chrome on macOS", () => {
		const ua =
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
		expect(deviceNameFromUserAgent(ua)).toBe("Chrome on macOS");
	});

	it("identifies Safari on iPhone (not Chrome)", () => {
		const ua =
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
		expect(deviceNameFromUserAgent(ua)).toBe("Safari on iPhone");
	});

	it("identifies Edge over Chrome", () => {
		const ua =
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
		expect(deviceNameFromUserAgent(ua)).toBe("Edge on Windows");
	});

	it("identifies Firefox on Linux", () => {
		const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";
		expect(deviceNameFromUserAgent(ua)).toBe("Firefox on Linux");
	});

	it("identifies Chrome on Android", () => {
		const ua =
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
		expect(deviceNameFromUserAgent(ua)).toBe("Chrome on Android");
	});
});
