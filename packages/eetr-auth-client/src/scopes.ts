/**
 * Standard OpenID Connect scopes recognized by the eetr-auth server. These are seeded
 * on install; an admin still grants them to each client. Use them when building an
 * authorization request or token exchange so a typo can't silently drop `openid` (which
 * would make `/userinfo` return 403 insufficient_scope).
 */
export const OIDCScope = {
  /** Required to mint an id_token and to call the `/userinfo` endpoint. */
  OpenId: "openid",
  /** Gates the `name` / `preferred_username` / `picture` claims. */
  Profile: "profile",
  /** Gates the `email` / `email_verified` claims. */
  Email: "email",
} as const;

export type OIDCScopeValue = (typeof OIDCScope)[keyof typeof OIDCScope];

/** The standard OIDC scopes, in canonical order: `openid profile email`. */
export const STANDARD_OIDC_SCOPES: readonly OIDCScopeValue[] = [
  OIDCScope.OpenId,
  OIDCScope.Profile,
  OIDCScope.Email,
];

/**
 * Merge a free-form `scope` string and/or a `scopes` array into a single
 * space-delimited scope string, trimmed, de-duplicated, and order-preserving
 * (the `scope` string first, then `scopes`). Returns `undefined` when neither
 * yields any scope, so callers can omit the parameter entirely.
 */
export function resolveScopeParam(
  scope?: string,
  scopes?: readonly string[]
): string | undefined {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  };
  if (scope) scope.split(/\s+/).forEach(add);
  if (scopes) scopes.forEach(add);
  return out.length > 0 ? out.join(" ") : undefined;
}
