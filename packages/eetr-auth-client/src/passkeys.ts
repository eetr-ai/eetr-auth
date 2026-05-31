import { OAuthError } from "./api.js";

/**
 * Safe, display-only view of a passkey returned by the auth server. Mirrors the
 * server-side `PasskeySummary` — never includes the public key, counter, or raw
 * credential id.
 */
export interface PasskeySummary {
  id: string;
  name: string | null;
  /** Backed up / synced across devices (e.g. iCloud Keychain, Google Password Manager). */
  synced: boolean;
  /** Single-device credential. */
  deviceBound: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Config for the passkey management endpoints. These are user-scoped: the access
 * token must belong to the user whose passkeys are being managed.
 *
 * Note: only passkey *management* (list/rename/remove) is available here. Creating
 * or authenticating with a passkey is a WebAuthn ceremony that requires a browser
 * and cannot be driven by a server-side client.
 */
export interface UserClientConfig {
  baseUrl: string;
  accessToken: string;
}

function passkeysUrl(baseUrl: string, id?: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (id === undefined) {
    return `${trimmed}/api/users/passkey`;
  }
  return `${trimmed}/api/users/passkey/${encodeURIComponent(id)}`;
}

async function parseError(res: Response): Promise<OAuthError> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
  };
  return new OAuthError(
    data.error ?? "server_error",
    data.error_description ?? `Passkey API request failed: ${res.status}`
  );
}

/**
 * List the authenticated user's passkeys.
 */
export async function listPasskeys(config: UserClientConfig): Promise<PasskeySummary[]> {
  const res = await fetch(passkeysUrl(config.baseUrl), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  const data = (await res.json()) as { passkeys: PasskeySummary[] };
  return data.passkeys;
}

/**
 * Rename one of the authenticated user's passkeys. Throws `OAuthError` with code
 * `not_found` if the passkey does not exist or is not owned by the user.
 */
export async function renamePasskey(
  id: string,
  name: string,
  config: UserClientConfig
): Promise<void> {
  const res = await fetch(passkeysUrl(config.baseUrl, id), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
}

/**
 * Remove one of the authenticated user's passkeys (server-side record only — this
 * does not delete the credential from the device/authenticator). Throws `OAuthError`
 * with code `not_found` if the passkey does not exist or is not owned by the user.
 */
export async function removePasskey(id: string, config: UserClientConfig): Promise<void> {
  const res = await fetch(passkeysUrl(config.baseUrl, id), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
}
