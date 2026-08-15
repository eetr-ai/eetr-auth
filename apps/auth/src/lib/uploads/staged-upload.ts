/**
 * Staged uploads.
 *
 * A file is uploaded to a staging prefix first and only moved to its final key
 * when the surrounding form is saved. That buys three things:
 *
 * - validation happens before anything overwrites a live asset;
 * - the form can preview the new file and still be cancelled, leaving the
 *   current avatar or logo untouched;
 * - the write that replaces a live asset is part of saving the record, not a
 *   side effect of picking a file.
 *
 * Staged objects that are never promoted are orphans. Configure an R2 lifecycle
 * rule to expire the `staging/` prefix (a day is plenty) — a client that closes
 * its tab mid-edit cannot be relied on to clean up after itself.
 */

export const STAGING_PREFIX = "staging/";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);

/** Returns a human-readable reason the upload is unacceptable, or null. */
export function validateImageUpload(file: { type: string; size: number }): string | null {
	if (!EXTENSION_BY_MIME_TYPE[file.type]) {
		return "Unsupported image type. Use JPEG, PNG, or WEBP.";
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		return "Image is too large. Maximum is 5MB.";
	}
	if (file.size === 0) {
		return "The file is empty.";
	}
	return null;
}

export function extensionForMimeType(contentType: string): string {
	return EXTENSION_BY_MIME_TYPE[contentType] ?? "bin";
}

/**
 * A fresh, unguessable staging key. Random rather than derived from the target
 * so that staging a file never reveals — or collides with — another record's
 * final key.
 */
export function newStagedKey(contentType: string): string {
	return `${STAGING_PREFIX}${crypto.randomUUID()}.${extensionForMimeType(contentType)}`;
}

/**
 * Whether `key` is a well-formed staging key.
 *
 * This is the security boundary. Promotion copies from a caller-supplied key,
 * so without this check a request could name any object in the bucket — say
 * another user's avatar — and have it copied over its own target. Traversal
 * segments are rejected for the same reason.
 */
export function isStagedKey(key: string): boolean {
	if (!key.startsWith(STAGING_PREFIX)) return false;
	const rest = key.slice(STAGING_PREFIX.length);
	if (rest.length === 0) return false;
	if (rest.includes("/")) return false;
	if (rest.includes("..")) return false;
	return /^[A-Za-z0-9-]+\.[A-Za-z0-9]+$/.test(rest);
}

/**
 * The extension of a staged key, for building the final key.
 *
 * Safe to interpolate: `isStagedKey` has already constrained it to
 * `[A-Za-z0-9]+`, so it cannot carry a path segment or a traversal.
 */
export function extensionOfStagedKey(stagedKey: string): string {
	if (!isStagedKey(stagedKey)) return "bin";
	return stagedKey.slice(stagedKey.lastIndexOf(".") + 1);
}

export class StagedUploadError extends Error {}

/** The subset of R2Bucket this module needs, so tests need no R2. */
export interface AssetBucket {
	get(key: string): Promise<{
		body: ReadableStream | null;
		httpMetadata?: { contentType?: string };
	} | null>;
	put(
		key: string,
		value: ReadableStream | ArrayBuffer,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>;
	delete(key: string): Promise<void>;
}

/**
 * Moves a staged object to its final key and returns that key.
 *
 * R2 has no rename, so this is a copy followed by a delete. The delete is
 * best-effort: if it fails the promotion still succeeded, and the leftover is
 * swept by the staging lifecycle rule.
 */
export async function promoteStagedUpload(
	bucket: AssetBucket,
	stagedKey: string,
	finalKey: string,
): Promise<string> {
	if (!isStagedKey(stagedKey)) {
		throw new StagedUploadError("That upload reference is not valid.");
	}
	const staged = await bucket.get(stagedKey);
	if (!staged || !staged.body) {
		throw new StagedUploadError("That upload has expired. Please choose the file again.");
	}

	await bucket.put(finalKey, staged.body, {
		httpMetadata: { contentType: staged.httpMetadata?.contentType },
	});

	try {
		await bucket.delete(stagedKey);
	} catch {
		// Leaving the staged copy behind is harmless; the lifecycle rule gets it.
	}

	return finalKey;
}

/** Best-effort discard, for when a form is cancelled. Never throws. */
export async function discardStagedUpload(
	bucket: AssetBucket,
	stagedKey: string,
): Promise<void> {
	if (!isStagedKey(stagedKey)) return;
	try {
		await bucket.delete(stagedKey);
	} catch {
		// Same as above: the lifecycle rule is the backstop.
	}
}
