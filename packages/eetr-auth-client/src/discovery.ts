import type { OIDCDiscovery, OAuthServerMetadata } from "./types.js";

export async function fetchOIDCDiscovery(issuerUrl: string): Promise<OIDCDiscovery> {
  const url = new URL("/.well-known/openid-configuration", issuerUrl);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch OIDC discovery: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<OIDCDiscovery>;
}

export async function fetchOAuthMetadata(issuerUrl: string): Promise<OAuthServerMetadata> {
  const url = new URL("/.well-known/oauth-authorization-server", issuerUrl);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch OAuth metadata: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<OAuthServerMetadata>;
}
