import { OAuthError } from "./api.js";

export interface AdminUserRecord {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  avatarKey: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface AdminClientConfig {
  baseUrl: string;
  accessToken: string;
}

export interface CreateUserParams {
  username: string;
  password: string;
  name?: string | null;
  email?: string | null;
}

export interface UpdateUserParams {
  username?: string;
  password?: string;
  isAdmin?: boolean;
  name?: string | null;
  email?: string | null;
  emailVerifiedAt?: string | null;
}

function adminUsersUrl(baseUrl: string, idOrUsername?: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (idOrUsername === undefined) {
    return `${trimmed}/api/admin/users`;
  }
  return `${trimmed}/api/admin/users/${encodeURIComponent(idOrUsername)}`;
}

async function parseError(res: Response): Promise<OAuthError> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
  };
  return new OAuthError(
    data.error ?? "server_error",
    data.error_description ?? `Admin API request failed: ${res.status}`
  );
}

/**
 * Fetch an admin-visible user by internal UUID or username.
 */
export async function getAdminUser(
  idOrUsername: string,
  config: AdminClientConfig
): Promise<AdminUserRecord> {
  const res = await fetch(adminUsersUrl(config.baseUrl, idOrUsername), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json() as Promise<AdminUserRecord>;
}

export async function createAdminUser(
  params: CreateUserParams,
  config: AdminClientConfig
): Promise<AdminUserRecord> {
  const res = await fetch(adminUsersUrl(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json() as Promise<AdminUserRecord>;
}

/**
 * Update an admin-visible user. `idOrUsername` accepts either the internal
 * UUID or the username.
 */
export async function updateAdminUser(
  idOrUsername: string,
  updates: UpdateUserParams,
  config: AdminClientConfig
): Promise<AdminUserRecord> {
  const res = await fetch(adminUsersUrl(config.baseUrl, idOrUsername), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json() as Promise<AdminUserRecord>;
}

/**
 * Delete an admin-visible user. `idOrUsername` accepts either the internal
 * UUID or the username.
 */
export async function deleteAdminUser(
  idOrUsername: string,
  config: AdminClientConfig
): Promise<void> {
  const res = await fetch(adminUsersUrl(config.baseUrl, idOrUsername), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
}
