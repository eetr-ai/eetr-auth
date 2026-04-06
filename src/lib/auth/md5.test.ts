import { describe, expect, it } from "vitest";
import { md5 } from "@/lib/auth/md5";

describe("md5", () => {
	it("hashes an empty string", () => {
		expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
	});

	it("hashes a known password string", () => {
		expect(md5("password")).toBe("5f4dcc3b5aa765d61d8327deb882cf99");
	});
});