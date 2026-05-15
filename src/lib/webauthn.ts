// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { db } from "@/db";
import {
  authSessions,
  pinAttempts,
  users,
  webauthnChallenges,
  webauthnCredentials,
} from "@/db/schema";
import { isOwnerUser } from "@/lib/ownership";
import { MAX_PIN_ATTEMPTS, IP_BLOCK_DURATION_MS } from "@/lib/pin";
import { getPublicAppOrigin } from "@/lib/public-origin";
import {
  buildRateLimitKey,
  countRecentRateLimitAttempts,
  recordRateLimitAttempt,
  resolveRateLimitClientIp,
} from "@/lib/rate-limit";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type UserLike = Pick<typeof users.$inferSelect, "id" | "userId" | "email" | "attribute" | "ownerUserId">;
type WebAuthnAction = "verified" | "register" | "authenticate";

export function isWebAuthnEnabled() {
  return process.env.WEBAUTHN_ENABLED === "true";
}

export function isWebAuthnOwnerRequired() {
  return process.env.WEBAUTHN_OWNER_REQUIRED === "true";
}

export function isWebAuthnRequiredForUser(user: UserLike) {
  return isWebAuthnEnabled() && isWebAuthnOwnerRequired() && isOwnerUser(user);
}

export function buildWebAuthnConfig(request?: NextRequest | Request) {
  const origin =
    process.env.WEBAUTHN_ORIGIN?.trim()
    || getPublicAppOrigin()
    || (request ? new URL(request.url).origin : "");
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "Keinage";
  let rpID = process.env.WEBAUTHN_RP_ID?.trim();

  if (!rpID && origin) {
    rpID = new URL(origin).hostname;
  }

  return {
    enabled: isWebAuthnEnabled(),
    ownerRequired: isWebAuthnOwnerRequired(),
    rpID: rpID || "localhost",
    rpName,
    origin: origin || "http://localhost:3000",
  };
}

export async function countWebAuthnCredentials(userId: string) {
  const credentials = await db
    .select({ id: webauthnCredentials.id })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));
  return credentials.length;
}

export async function getWebAuthnPostAuthAction(user: UserLike): Promise<WebAuthnAction> {
  if (!isWebAuthnRequiredForUser(user)) {
    return "verified";
  }

  const credentialsCount = await countWebAuthnCredentials(user.id);
  return credentialsCount === 0 ? "register" : "authenticate";
}

export async function isWebAuthnVerifiedAtSessionCreation(user: UserLike) {
  return (await getWebAuthnPostAuthAction(user)) === "verified";
}

export async function getWebAuthnRedirectForSession(input: {
  user: UserLike;
  webauthnVerified: boolean;
  redirectTo?: string | null;
}) {
  if (!isWebAuthnRequiredForUser(input.user) || input.webauthnVerified) {
    return null;
  }

  const action = await getWebAuthnPostAuthAction(input.user);
  const path = action === "register" ? "/passkey/setup" : "/passkey/verify";
  if (!input.redirectTo) {
    return path;
  }

  return `${path}?redirectTo=${encodeURIComponent(input.redirectTo)}`;
}

export async function markSessionWebAuthnVerified(sessionToken: string) {
  await db
    .update(authSessions)
    .set({ webauthnVerified: true })
    .where(eq(authSessions.sessionToken, sessionToken));
}

export function buildWebAuthnRateLimitKey(input: {
  request: NextRequest;
  user: UserLike;
  type: "registration" | "authentication";
}) {
  return buildRateLimitKey({
    flow: "webauthn",
    clientIp: resolveRateLimitClientIp(input.request),
    subject: `${input.user.userId}:${input.type}`,
  });
}

export async function checkWebAuthnRateLimit(rateLimitKey: string) {
  const attempts = await countRecentRateLimitAttempts(
    rateLimitKey,
    IP_BLOCK_DURATION_MS,
  );
  return {
    limited: attempts >= MAX_PIN_ATTEMPTS,
    remaining: Math.max(MAX_PIN_ATTEMPTS - attempts, 0),
  };
}

export async function recordWebAuthnFailure(rateLimitKey: string) {
  await recordRateLimitAttempt(rateLimitKey);
}

export async function clearWebAuthnFailures(rateLimitKey: string) {
  await db.delete(pinAttempts).where(eq(pinAttempts.ipAddress, rateLimitKey));
}

function encodePublicKey(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function decodePublicKey(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function toWebAuthnCredential(
  credential: Pick<typeof webauthnCredentials.$inferSelect, "credentialId" | "publicKey" | "counter" | "transports">,
): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: decodePublicKey(credential.publicKey),
    counter: credential.counter,
    transports: parseTransports(credential.transports),
  };
}

export async function createRegistrationOptions(input: {
  request: NextRequest;
  user: UserLike;
}) {
  const config = buildWebAuthnConfig(input.request);
  const existingCredentials = await db
    .select({
      credentialId: webauthnCredentials.credentialId,
      transports: webauthnCredentials.transports,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, input.user.id));

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: Buffer.from(input.user.id),
    userName: input.user.email,
    userDisplayName: input.user.userId,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: parseTransports(credential.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  await storeChallenge({
    userId: input.user.id,
    challenge: options.challenge,
    type: "registration",
  });

  return options;
}

export async function createAuthenticationOptions(input: {
  request: NextRequest;
  user: UserLike;
}) {
  const config = buildWebAuthnConfig(input.request);
  const credentials = await db
    .select({
      credentialId: webauthnCredentials.credentialId,
      transports: webauthnCredentials.transports,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, input.user.id));

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: parseTransports(credential.transports),
    })),
  });

  await storeChallenge({
    userId: input.user.id,
    challenge: options.challenge,
    type: "authentication",
  });

  return options;
}

async function storeChallenge(input: {
  userId: string;
  challenge: string;
  type: "registration" | "authentication";
}) {
  const now = new Date().toISOString();
  await db
    .update(webauthnChallenges)
    .set({ usedAt: now })
    .where(
      and(
        eq(webauthnChallenges.userId, input.userId),
        eq(webauthnChallenges.type, input.type),
        isNull(webauthnChallenges.usedAt),
      ),
    );

  await db.insert(webauthnChallenges).values({
    userId: input.userId,
    challenge: input.challenge,
    type: input.type,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
}

export async function consumeChallenge(input: {
  userId: string;
  challenge: string;
  type: "registration" | "authentication";
}) {
  const now = new Date().toISOString();
  const challenge = await db.query.webauthnChallenges.findFirst({
    where: and(
      eq(webauthnChallenges.userId, input.userId),
      eq(webauthnChallenges.challenge, input.challenge),
      eq(webauthnChallenges.type, input.type),
      isNull(webauthnChallenges.usedAt),
      gt(webauthnChallenges.expiresAt, now),
    ),
  });

  if (!challenge) {
    return null;
  }

  await db
    .update(webauthnChallenges)
    .set({ usedAt: now })
    .where(eq(webauthnChallenges.id, challenge.id));

  return challenge;
}

export async function storeRegistrationCredential(input: {
  userId: string;
  response: RegistrationResponseJSON;
  credential: WebAuthnCredential;
  credentialDeviceType?: string;
  credentialBackedUp?: boolean;
  name?: string;
}) {
  await db.insert(webauthnCredentials).values({
    userId: input.userId,
    credentialId: input.credential.id,
    publicKey: encodePublicKey(input.credential.publicKey),
    counter: input.credential.counter,
    transports: JSON.stringify(input.response.response.transports ?? []),
    deviceType: input.credentialDeviceType ?? null,
    backedUp: input.credentialBackedUp ?? false,
    name: input.name ?? "Passkey",
  });
}

export async function findCredentialForAuthentication(response: AuthenticationResponseJSON) {
  return db.query.webauthnCredentials.findFirst({
    where: eq(webauthnCredentials.credentialId, response.id),
  });
}
