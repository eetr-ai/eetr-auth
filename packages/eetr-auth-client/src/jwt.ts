import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "./types.js";

export interface ValidateJwtOptions {
  audience?: string | string[];
  issuer?: string;
  clockTolerance?: number;
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

export function decodeJwtPayload(token: string): JWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format: expected 3 parts");
  }
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json) as JWTPayload;
}
