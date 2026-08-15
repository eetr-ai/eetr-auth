import { describe, expect, it, vi } from "vitest";
import {
	STAGING_PREFIX,
	StagedUploadError,
	discardStagedUpload,
	isStagedKey,
	newStagedKey,
	promoteStagedUpload,
	validateImageUpload,
	type AssetBucket,
} from "./staged-upload";

function createBucket(objects: Record<string, string> = {}): AssetBucket & {
	store: Record<string, string>;
} {
	const store: Record<string, string> = { ...objects };
	return {
		store,
		get: vi.fn(async (key: string) =>
			key in store
				? { body: store[key] as unknown as ReadableStream, httpMetadata: { contentType: "image/png" } }
				: null,
		),
		put: vi.fn(async (key: string, value: unknown) => {
			store[key] = value as string;
		}),
		delete: vi.fn(async (key: string) => {
			delete store[key];
		}),
	};
}

describe("isStagedKey", () => {
	it("accepts a generated staging key", () => {
		expect(isStagedKey(newStagedKey("image/png"))).toBe(true);
	});

	it("rejects keys outside the staging prefix", () => {
		// The security boundary: promotion copies from a caller-supplied key, so
		// anything not in staging/ must be refused.
		expect(isStagedKey("avatars/someone-else.png")).toBe(false);
		expect(isStagedKey("site/logo.png")).toBe(false);
		expect(isStagedKey("")).toBe(false);
	});

	it("rejects traversal and nesting", () => {
		expect(isStagedKey(`${STAGING_PREFIX}../avatars/victim.png`)).toBe(false);
		expect(isStagedKey(`${STAGING_PREFIX}nested/file.png`)).toBe(false);
		expect(isStagedKey(`${STAGING_PREFIX}..`)).toBe(false);
	});

	it("rejects a prefix with no object name", () => {
		expect(isStagedKey(STAGING_PREFIX)).toBe(false);
	});
});

describe("validateImageUpload", () => {
	it("accepts a normal image", () => {
		expect(validateImageUpload({ type: "image/png", size: 1000 })).toBeNull();
	});

	it("rejects unsupported types", () => {
		expect(validateImageUpload({ type: "image/gif", size: 1000 })).toMatch(/Unsupported/);
		expect(validateImageUpload({ type: "text/html", size: 10 })).toMatch(/Unsupported/);
	});

	it("rejects files over 5MB", () => {
		expect(validateImageUpload({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/too large/);
	});

	it("rejects an empty file", () => {
		expect(validateImageUpload({ type: "image/png", size: 0 })).toMatch(/empty/);
	});
});

describe("promoteStagedUpload", () => {
	it("copies the staged object to the final key and removes the staged one", async () => {
		const staged = newStagedKey("image/png");
		const bucket = createBucket({ [staged]: "bytes" });

		const result = await promoteStagedUpload(bucket, staged, "avatars/u1.png");

		expect(result).toBe("avatars/u1.png");
		expect(bucket.store["avatars/u1.png"]).toBe("bytes");
		expect(bucket.store[staged]).toBeUndefined();
	});

	it("refuses to promote a key outside staging", async () => {
		const bucket = createBucket({ "avatars/victim.png": "bytes" });

		await expect(
			promoteStagedUpload(bucket, "avatars/victim.png", "avatars/attacker.png"),
		).rejects.toBeInstanceOf(StagedUploadError);
		// Nothing was read or written.
		expect(bucket.put).not.toHaveBeenCalled();
		expect(bucket.store["avatars/attacker.png"]).toBeUndefined();
	});

	it("reports a missing staged object rather than writing an empty asset", async () => {
		const bucket = createBucket();
		const staged = newStagedKey("image/png");

		await expect(promoteStagedUpload(bucket, staged, "avatars/u1.png")).rejects.toThrow(/expired/i);
		expect(bucket.put).not.toHaveBeenCalled();
	});

	it("still succeeds when deleting the staged copy fails", async () => {
		const staged = newStagedKey("image/png");
		const bucket = createBucket({ [staged]: "bytes" });
		bucket.delete = vi.fn(async () => {
			throw new Error("R2 unavailable");
		});

		await expect(promoteStagedUpload(bucket, staged, "avatars/u1.png")).resolves.toBe(
			"avatars/u1.png",
		);
		expect(bucket.store["avatars/u1.png"]).toBe("bytes");
	});
});

describe("discardStagedUpload", () => {
	it("deletes a staged object", async () => {
		const staged = newStagedKey("image/png");
		const bucket = createBucket({ [staged]: "bytes" });
		await discardStagedUpload(bucket, staged);
		expect(bucket.store[staged]).toBeUndefined();
	});

	it("ignores keys outside staging", async () => {
		const bucket = createBucket({ "avatars/u1.png": "bytes" });
		await discardStagedUpload(bucket, "avatars/u1.png");
		expect(bucket.delete).not.toHaveBeenCalled();
		expect(bucket.store["avatars/u1.png"]).toBe("bytes");
	});

	it("never throws when the bucket fails", async () => {
		const staged = newStagedKey("image/png");
		const bucket = createBucket({ [staged]: "bytes" });
		bucket.delete = vi.fn(async () => {
			throw new Error("R2 unavailable");
		});
		await expect(discardStagedUpload(bucket, staged)).resolves.toBeUndefined();
	});
});
