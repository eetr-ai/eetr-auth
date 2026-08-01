import { describe, expect, it } from "vitest";

import {
	canonicalizeLoopbackUri,
	isLoopbackHostname,
	matchRegisteredRedirectUri,
} from "@/lib/services/loopback-uri";

describe("isLoopbackHostname", () => {
	it.each(["localhost", "LOCALHOST", "127.0.0.1", "127.0.0.2", "127.1.2.3", "127.255.255.255"])(
		"treats %s as loopback",
		(host) => {
			expect(isLoopbackHostname(host)).toBe(true);
		}
	);

	it("accepts the IPv6 loopback in both bracketed and bare form", () => {
		expect(isLoopbackHostname("[::1]")).toBe(true);
		expect(isLoopbackHostname("::1")).toBe(true);
	});

	it.each([
		"126.0.0.1",
		"128.0.0.1",
		"12.7.0.0.1",
		"8.8.8.8",
		"192.168.0.5",
		"10.0.0.1",
		"0.0.0.0",
		"example.com",
		"localhost.evil.com",
		"notlocalhost",
	])("does not treat %s as loopback", (host) => {
		expect(isLoopbackHostname(host)).toBe(false);
	});

	it("rejects an out-of-range octet", () => {
		expect(isLoopbackHostname("127.0.0.256")).toBe(false);
	});
});

describe("canonicalizeLoopbackUri", () => {
	it("collapses a loopback IPv4 host to localhost, preserving port and path", () => {
		expect(canonicalizeLoopbackUri("http://127.0.0.1:57162/callback/abc")).toBe(
			"http://localhost:57162/callback/abc"
		);
	});

	it("collapses hosts anywhere in 127.0.0.0/8", () => {
		expect(canonicalizeLoopbackUri("http://127.0.0.2:8080/cb")).toBe("http://localhost:8080/cb");
	});

	it("preserves the query string", () => {
		expect(canonicalizeLoopbackUri("http://127.0.0.1:3000/cb?a=1&b=2")).toBe(
			"http://localhost:3000/cb?a=1&b=2"
		);
	});

	it("collapses the IPv6 loopback", () => {
		expect(canonicalizeLoopbackUri("http://[::1]:57162/cb")).toBe("http://localhost:57162/cb");
	});

	it("keeps the scheme, so https loopback stays https", () => {
		expect(canonicalizeLoopbackUri("https://127.0.0.1:8443/cb")).toBe(
			"https://localhost:8443/cb"
		);
	});

	it("returns a localhost URI byte-identical rather than re-serializing it", () => {
		// No trailing slash added — a re-serialized URL would have produced "http://localhost:3000/".
		expect(canonicalizeLoopbackUri("http://localhost:3000")).toBe("http://localhost:3000");
	});

	it("leaves non-loopback URIs untouched", () => {
		expect(canonicalizeLoopbackUri("https://claude.ai/api/mcp/auth_callback")).toBe(
			"https://claude.ai/api/mcp/auth_callback"
		);
		expect(canonicalizeLoopbackUri("https://192.168.0.5/cb")).toBe("https://192.168.0.5/cb");
	});

	it("leaves an unparsable value untouched", () => {
		expect(canonicalizeLoopbackUri("not a url")).toBe("not a url");
	});
});

describe("matchRegisteredRedirectUri", () => {
	it("returns the exact match when one exists", () => {
		const registered = ["https://a.example.com/cb", "https://b.example.com/cb"];
		expect(matchRegisteredRedirectUri("https://b.example.com/cb", registered)).toBe(
			"https://b.example.com/cb"
		);
	});

	it("matches a localhost request against a 127.0.0.1 registration", () => {
		// The production failure: Next.js rewrote the query parameter to `localhost` before the
		// route handler saw it, while registration (a JSON body) kept `127.0.0.1`.
		expect(
			matchRegisteredRedirectUri("http://localhost:57162/callback/iDt-RqU9krou", [
				"http://127.0.0.1:57162/callback/iDt-RqU9krou",
			])
		).toBe("http://127.0.0.1:57162/callback/iDt-RqU9krou");
	});

	it("returns the registered form, not the requested one", () => {
		// The authorization code binds to this value and the token exchange compares against it,
		// so it has to be the URI the client registered.
		const registered = ["http://127.0.0.1:9000/cb"];
		expect(matchRegisteredRedirectUri("http://localhost:9000/cb", registered)).toBe(
			"http://127.0.0.1:9000/cb"
		);
	});

	it("matches a 127.0.0.1 request against a localhost registration", () => {
		expect(
			matchRegisteredRedirectUri("http://127.0.0.1:6274/oauth/callback", [
				"http://localhost:6274/oauth/callback",
			])
		).toBe("http://localhost:6274/oauth/callback");
	});

	it("still requires the port to match", () => {
		expect(
			matchRegisteredRedirectUri("http://localhost:60033/cb", ["http://127.0.0.1:59836/cb"])
		).toBeNull();
	});

	it("still requires the path to match", () => {
		expect(
			matchRegisteredRedirectUri("http://localhost:5173/evil", ["http://127.0.0.1:5173/cb"])
		).toBeNull();
	});

	it("still requires the scheme to match", () => {
		expect(
			matchRegisteredRedirectUri("https://localhost:5173/cb", ["http://127.0.0.1:5173/cb"])
		).toBeNull();
	});

	it("does not let a non-loopback host match a loopback registration", () => {
		expect(
			matchRegisteredRedirectUri("http://evil.example.com:5173/cb", ["http://127.0.0.1:5173/cb"])
		).toBeNull();
	});

	it("does not treat a lookalike host as loopback", () => {
		expect(
			matchRegisteredRedirectUri("http://localhost.evil.com:5173/cb", [
				"http://127.0.0.1:5173/cb",
			])
		).toBeNull();
	});

	it("returns null against an empty allowlist", () => {
		expect(matchRegisteredRedirectUri("http://localhost:5173/cb", [])).toBeNull();
	});

	it("picks the matching entry out of a mixed allowlist", () => {
		const registered = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:5173/cb"];
		expect(matchRegisteredRedirectUri("http://localhost:5173/cb", registered)).toBe(
			"http://127.0.0.1:5173/cb"
		);
	});
});
