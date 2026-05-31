import { createRemoteJWKSet, jwtVerify } from "jose";
import type { IDTokenClaims, JWTPayload } from "./types.js";

export interface ValidateJwtOptions {
  audience?: string | string[];
  issuer?: string;
  clockTolerance?: number;
}

export interface ValidateIdTokenOptions extends ValidateJwtOptions {
  /** When set, the id_token's `nonce` claim must match this value (OIDC replay defense). */
  nonce?: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache.has(jwksUri)) {
    jwksCache.set(jwksUri, createRemoteJWKSet(new URL(jwksUri)));
  }
  return jwksCache.get(jwksUri)!;
}

export async function validateJwt(
  token: string,
  jwksUri: string,
  options: ValidateJwtOptions = {}
): Promise<JWTPayload> {
  const jwks = getJwks(jwksUri);
  const { payload } = await jwtVerify(token, jwks, {
    audience: options.audience,
    issuer: options.issuer,
    clockTolerance: options.clockTolerance ?? 5,
  });
  return payload as JWTPayload;
}

/**
 * Verify an OIDC id_token: checks the RS256 signature against the JWKS plus
 * `iss`/`aud`/`exp` (via {@link validateJwt}), and — when `options.nonce` is
 * supplied — that the token's `nonce` claim matches, defending against replay.
 */
export async function validateIdToken(
  token: string,
  jwksUri: string,
  options: ValidateIdTokenOptions = {}
): Promise<IDTokenClaims> {
  const { nonce, ...jwtOptions } = options;
  const payload = (await validateJwt(token, jwksUri, jwtOptions)) as IDTokenClaims;
  if (nonce !== undefined && payload.nonce !== nonce) {
    throw new Error("id_token nonce mismatch");
  }
  return payload;
}

export function decodeJwtPayload(token: string): JWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format: expected 3 parts");
  }
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json) as JWTPayload;
}
