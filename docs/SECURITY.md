<p align="center">
  English | <a href="./SECURITY.ja.md">日本語</a>
</p>

# Security Hardening

This document summarizes security settings to review for official SaaS and production self-hosted deployments.

## Official SaaS Mode

When `NODE_ENV=production` and either `KEINAGE_DEPLOYMENT_MODE=official-saas` or `KEINAGE_OFFICIAL_SAAS=true` is set, Keinage validates the production security configuration at startup. Startup fails when required settings are missing.

Required settings:

- `APP_PUBLIC_ORIGIN` must be a public `https://` origin
- `TRUST_PROXY_HEADERS=true`
- `BILLING_MODE=stripe`
- `PLAN_ENFORCEMENT_MODE=billing`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and every Stripe price ID
- `GOOGLE_OAUTH_ENABLED=true`, `GOOGLE_OAUTH_CLIENT_ID`, and `GOOGLE_OAUTH_CLIENT_SECRET`
- `SUPER_OWNER_REQUIRE_GOOGLE=true`
- `S3_REGION` and `S3_BUCKET`
- `STORAGE_DELIVERY_MODE=cloudfront-signed-url`
- `STORAGE_CDN_BASE_URL`, `CLOUDFRONT_KEY_PAIR_ID`, and `CLOUDFRONT_PRIVATE_KEY`

Self-hosted deployments do not fail this validation unless official SaaS mode is enabled. A warning is still emitted when `APP_PUBLIC_ORIGIN` is not HTTPS in production.

## Rate Limiting

Rate limits protect authentication, registration, contact, billing, and upload entry points. `x-forwarded-for` and `x-real-ip` are trusted only when `TRUST_PROXY_HEADERS=true`; otherwise requests are grouped into the direct-client bucket.

Protected operations:

- Credentials login / PIN login
- Owner signup / signup resend / Google OAuth start
- Contact form
- Billing checkout / portal
- Server upload / S3 direct upload init / complete

## Security Headers

Every route returns:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Strict-Transport-Security` in production only

A fixed CSP is not currently applied because S3 presigned uploads, CloudFront, Google Fonts, weather images, and other deployment-specific resources require different allowlists. In official SaaS deployments, configure CSP at the CDN / WAF layer and include S3, CloudFront, and the application origin in `connect-src`.

## Upload Validation

Uploads are validated against both Content-Type and file extension. Supported formats are JPEG, PNG, WebP, GIF, MP4, and WebM. S3 direct uploads run the same validation before signing and before completion; completion also verifies object size and Content-Type with `HeadObject`.

Media for private boards is authorized against the Owner scope through `/uploads/[...path]`. Raw storage-key requests return 404 when no corresponding `media_items` reference exists, preventing the application from serving files left behind after failed account deletion or incomplete S3 direct uploads. With CloudFront signed URL delivery, the application authorizes the request before redirecting to a short-lived signed URL.

## Secret Logging

Keinage does not log Stripe webhook secrets, Stripe API secrets, OIDC client secrets, authorization codes, access tokens, ID tokens, or raw webhook bodies. OIDC discovery, JWKS, and token-exchange failures log only the HTTP status.

## AWS Least-Privilege Notes

For official SaaS deployments, grant the minimum required permissions to the ECS, App Runner, EC2, or equivalent execution role.

S3 media bucket:

- `s3:PutObject`
- `s3:GetObject`
- `s3:HeadObject`
- `s3:DeleteObject`
- `s3:ListBucket`

Restrict resources to the media bucket and the `owners/*` prefix where possible. Do not use static access keys; use the AWS SDK default credential provider chain and an IAM role.

CloudFront:

- Inject the signed URL private key through environment variables or a secrets manager.
- Enable the S3 public access block and allow reads only through CloudFront Origin Access Control.

RDS PostgreSQL:

- Limit the application database user to the permissions required for the Keinage schema.
- Do not expose the database directly to the public internet; restrict it to private-network access from the application runtime.

Secrets:

- Do not commit Stripe, Google, SMTP, or CloudFront private keys to Git.
- Inject them into CI/CD and runtime environments through a secrets manager or the hosting platform's secret store.
