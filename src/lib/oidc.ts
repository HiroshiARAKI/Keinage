// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey, randomBytes, verify } from "crypto";
import type { JsonWebKey } from "crypto";

const DEFAULT_DISCOVERY_MAX_AGE_MS = 60 * 60 * 1000;
const DEFAULT_JWKS_MAX_AGE_MS = 60 * 60 * 1000;

export interface OidcProviderConfig {
  id: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  prompt?: string;
}

export interface OidcDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
}

export interface OidcFlowContext {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  nonce: string;
  expiresAt: string;
}

export interface OidcUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

interface OidcIdTokenHeader {
  alg?: string;
  kid?: string;
}

interface OidcIdTokenPayload {
  aud?: string | string[];
  exp?: number;
  iss?: string;
  nonce?: string;
}

type OidcJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

const discoveryCache = new Map<string, {
  expiresAt: number;
  metadata: OidcDiscoveryMetadata;
}>();

const jwksCache = new Map<string, {
  expiresAt: number;
  keys: OidcJwk[];
}>();

function normalizeIssuer(issuer: string) {
  return issuer.replace(/\/+$/g, "");
}

function base64UrlToBuffer(input: string): Buffer | null {
  try {
    return Buffer.from(input, "base64url");
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string | null {
  return base64UrlToBuffer(input)?.toString("utf8") ?? null;
}

function decodeJwtSegment<T>(segment: string): T | null {
  const decoded = base64UrlDecode(segment);
  if (!decoded) return null;

  try {
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function parseJwt(idToken: string) {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra !== undefined) {
    return null;
  }

  const header = decodeJwtSegment<OidcIdTokenHeader>(encodedHeader);
  const payload = decodeJwtSegment<OidcIdTokenPayload>(encodedPayload);
  const signature = base64UrlToBuffer(encodedSignature);
  if (!header || !payload || !signature) {
    return null;
  }

  return {
    encodedHeader,
    encodedPayload,
    header,
    payload,
    signature,
  };
}

function parseCacheMaxAge(cacheControl: string | null, fallbackMs: number) {
  const maxAge = cacheControl
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("max-age="))
    ?.slice("max-age=".length);
  const seconds = maxAge ? Number.parseInt(maxAge, 10) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : fallbackMs;
}

function randomOAuthValue(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

function computeCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function isValidAudience(audience: string | string[] | undefined, clientId: string) {
  return Array.isArray(audience)
    ? audience.includes(clientId)
    : audience === clientId;
}

export function createOidcFlowContext(maxAgeSeconds: number): OidcFlowContext {
  const codeVerifier = randomOAuthValue(64);

  return {
    state: randomOAuthValue(32),
    codeVerifier,
    codeChallenge: computeCodeChallenge(codeVerifier),
    nonce: randomOAuthValue(32),
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
  };
}

export async function discoverOidcProvider(
  provider: Pick<OidcProviderConfig, "id" | "issuer">,
): Promise<OidcDiscoveryMetadata | null> {
  const issuer = normalizeIssuer(provider.issuer);
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.metadata;
  }

  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) {
    console.error(`[oidc:${provider.id}] discovery failed`, {
      status: response.status,
    });
    return cached?.metadata ?? null;
  }

  const metadata = await response.json() as Partial<OidcDiscoveryMetadata>;
  if (
    metadata.issuer !== issuer ||
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.jwks_uri
  ) {
    console.error(`[oidc:${provider.id}] discovery metadata is incomplete`);
    return null;
  }

  const normalized: OidcDiscoveryMetadata = {
    issuer: metadata.issuer,
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    userinfo_endpoint: metadata.userinfo_endpoint,
    jwks_uri: metadata.jwks_uri,
  };
  discoveryCache.set(issuer, {
    metadata: normalized,
    expiresAt: Date.now() + parseCacheMaxAge(
      response.headers.get("cache-control"),
      DEFAULT_DISCOVERY_MAX_AGE_MS,
    ),
  });
  return normalized;
}

export async function buildOidcAuthorizationUrl(input: {
  provider: OidcProviderConfig;
  state: string;
  codeChallenge: string;
  nonce: string;
}): Promise<string | null> {
  const metadata = await discoverOidcProvider(input.provider);
  if (!metadata) return null;

  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("client_id", input.provider.clientId);
  url.searchParams.set("redirect_uri", input.provider.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.provider.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.provider.prompt) {
    url.searchParams.set("prompt", input.provider.prompt);
  }
  return url.toString();
}

async function fetchOidcJwks(input: {
  providerId: string;
  jwksUri: string;
}): Promise<OidcJwk[] | null> {
  const cached = jwksCache.get(input.jwksUri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(input.jwksUri);
  if (!response.ok) {
    console.error(`[oidc:${input.providerId}] jwks fetch failed`, {
      status: response.status,
    });
    return cached?.keys ?? null;
  }

  const jwks = await response.json() as { keys?: OidcJwk[] };
  if (!Array.isArray(jwks.keys)) {
    return null;
  }

  jwksCache.set(input.jwksUri, {
    keys: jwks.keys,
    expiresAt: Date.now() + parseCacheMaxAge(
      response.headers.get("cache-control"),
      DEFAULT_JWKS_MAX_AGE_MS,
    ),
  });
  return jwks.keys;
}

async function verifyOidcIdTokenSignature(input: {
  providerId: string;
  jwksUri: string;
  encodedHeader: string;
  encodedPayload: string;
  header: OidcIdTokenHeader;
  signature: Buffer;
}) {
  if (input.header.alg !== "RS256" || !input.header.kid) {
    return false;
  }

  const keys = await fetchOidcJwks({
    providerId: input.providerId,
    jwksUri: input.jwksUri,
  });
  const jwk = keys?.find((key) =>
    key.kid === input.header.kid &&
    key.kty === "RSA" &&
    (!key.alg || key.alg === "RS256") &&
    (!key.use || key.use === "sig")
  );
  if (!jwk) {
    return false;
  }

  try {
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    return verify(
      "RSA-SHA256",
      Buffer.from(`${input.encodedHeader}.${input.encodedPayload}`),
      publicKey,
      input.signature,
    );
  } catch (error) {
    console.error(`[oidc:${input.providerId}] id token signature verification failed`, error);
    return false;
  }
}

async function isValidOidcIdToken(input: {
  provider: OidcProviderConfig;
  metadata: OidcDiscoveryMetadata;
  idToken?: string;
  expectedNonce: string;
}) {
  if (!input.idToken) return false;

  const parsed = parseJwt(input.idToken);
  if (!parsed) return false;

  const validIssuer = parsed.payload.iss === input.metadata.issuer;
  const validAudience = isValidAudience(parsed.payload.aud, input.provider.clientId);
  const validExpiry = typeof parsed.payload.exp === "number" &&
    parsed.payload.exp * 1000 > Date.now();
  const validNonce = parsed.payload.nonce === input.expectedNonce;

  if (!validIssuer || !validAudience || !validExpiry || !validNonce) {
    return false;
  }

  return verifyOidcIdTokenSignature({
    providerId: input.provider.id,
    jwksUri: input.metadata.jwks_uri,
    encodedHeader: parsed.encodedHeader,
    encodedPayload: parsed.encodedPayload,
    header: parsed.header,
    signature: parsed.signature,
  });
}

export async function fetchOidcUserInfo(input: {
  provider: OidcProviderConfig;
  code: string;
  codeVerifier: string;
  expectedNonce: string;
}): Promise<OidcUserInfo | null> {
  const metadata = await discoverOidcProvider(input.provider);
  if (!metadata || !metadata.userinfo_endpoint) return null;

  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.provider.clientId,
      client_secret: input.provider.clientSecret,
      redirect_uri: input.provider.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    console.error(`[oidc:${input.provider.id}] token exchange failed`, {
      status: tokenResponse.status,
    });
    return null;
  }

  const tokenData = await tokenResponse.json() as {
    access_token?: string;
    id_token?: string;
  };
  if (!tokenData.access_token) return null;
  if (!await isValidOidcIdToken({
    provider: input.provider,
    metadata,
    idToken: tokenData.id_token,
    expectedNonce: input.expectedNonce,
  })) {
    console.error(`[oidc:${input.provider.id}] id token validation failed`);
    return null;
  }

  const userInfoResponse = await fetch(metadata.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoResponse.ok) {
    console.error(`[oidc:${input.provider.id}] userinfo failed`, await userInfoResponse.text());
    return null;
  }

  const userInfo = await userInfoResponse.json() as OidcUserInfo;
  if (!userInfo.sub || !userInfo.email) return null;
  return {
    ...userInfo,
    email: userInfo.email.trim().toLowerCase(),
  };
}
