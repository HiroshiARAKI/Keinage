// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 300;

export function isCloudFrontSignedDeliveryMode(): boolean {
  return process.env.STORAGE_DELIVERY_MODE?.trim() === "cloudfront-signed-url";
}

export function mediaRouteUrlForMediaId(mediaId: string, variant: "original" | "thumbnail" = "original"): string {
  const encodedId = encodeURIComponent(mediaId);
  const suffix = variant === "thumbnail" ? `thumbs/${encodedId}` : encodedId;
  const configuredBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

  if (configuredBase) {
    return `${configuredBase}/${suffix}`;
  }

  return `/uploads/${suffix}`;
}

export function createCloudFrontSignedUrl(objectKey: string): string {
  const cdnBaseUrl = process.env.STORAGE_CDN_BASE_URL?.trim().replace(/\/+$/, "");
  if (!cdnBaseUrl) {
    throw new Error("STORAGE_CDN_BASE_URL is required for CloudFront signed URL delivery");
  }

  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID?.trim();
  if (!keyPairId) {
    throw new Error("CLOUDFRONT_KEY_PAIR_ID is required for CloudFront signed URL delivery");
  }

  const rawPrivateKey = process.env.CLOUDFRONT_PRIVATE_KEY?.trim();
  if (!rawPrivateKey) {
    throw new Error("CLOUDFRONT_PRIVATE_KEY is required for CloudFront signed URL delivery");
  }

  const configuredExpires = Number(process.env.CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS ?? "");
  const expiresInSeconds = Number.isFinite(configuredExpires) && configuredExpires > 0
    ? Math.floor(configuredExpires)
    : DEFAULT_SIGNED_URL_EXPIRES_SECONDS;
  const dateLessThan = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  return getSignedUrl({
    url: `${cdnBaseUrl}/${objectKey.replace(/^\/+/, "")}`,
    keyPairId,
    privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
    dateLessThan,
  });
}
