<p align="center">
  English | <a href="./DEPLOYMENT.ja.md">日本語</a>
</p>

# Keinage Deployment Guide

Last updated: May 16, 2026

## 1. Purpose

This document covers environment variables, billing, storage, and deployment considerations for both self-hosted Keinage installations and the official SaaS service.

- Self-hosted: runs without billing or plan restrictions, using local or S3-compatible storage.
- Official SaaS: combines Stripe Billing, RDS PostgreSQL, S3, CloudFront, Google OAuth/OIDC, SMTP, and audit logging.

Never commit secrets, tokens, Stripe price IDs, CloudFront private keys, or SMTP passwords to Git. Use placeholders only in documentation and `.env.example`.

## 2. Deployment Modes

| Use case | `BILLING_MODE` | `PLAN_ENFORCEMENT_MODE` | Behavior |
| --- | --- | --- | --- |
| Default OSS / self-hosted | `disabled` | `unlimited` | No billing UI and no plan restrictions |
| Test local restrictions in self-hosted mode | `disabled` | `local` | Exercises plan restriction logic without Stripe |
| Official SaaS | `stripe` | `billing` | Synchronizes Stripe subscriptions with each Owner's effective plan and enforces limits |

With `BILLING_MODE=disabled`, billing links are hidden and `/api/billing/webhook` returns 404. With `PLAN_ENFORCEMENT_MODE=unlimited`, no plan restrictions are enforced.

## 3. Default Self-hosted Configuration

The defaults in `.env.example` are intended to work directly for self-hosted deployments.

```bash
BILLING_MODE=disabled
PLAN_ENFORCEMENT_MODE=unlimited
UPLOAD_MAX_BYTES=0
```

`UPLOAD_MAX_BYTES=0` means unlimited in self-hosted / unlimited mode. In official SaaS mode, the effective plan's `maxUploadBytes` takes precedence.

A basic self-hosted deployment needs only the following settings:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Docker Compose defaults to the local database. |
| `APP_PUBLIC_ORIGIN` | Recommended | Base origin for email links and OAuth callbacks, such as `http://localhost:3000` locally. |
| `SMTP_*` | Optional | Used for registration, invitations, PIN resets, and important notices. Relevant email flows are skipped or disabled when unset. |
| `GOOGLE_OAUTH_*` | Optional | Configure to enable Google account registration and login. |
| `WEBAUTHN_*` | Optional | Configure to require Passkey two-factor authentication for Owners. |
| `S3_*` / `STORAGE_*` | Optional | Configure to use S3-compatible storage instead of local `uploads/`. |
| `AUDIT_LOG_*` | Optional | Audit logging and retention settings for authentication, billing, account deletion, Super Owner operations, and more. |
| `WEATHER_PROVIDER` | Optional | Weather adapter: `openweatherapi` (default) or `tenkiyoho_api_jp`. |
| `OPENWEATHER_API_KEY` | Optional | OpenWeather API key fallback. The Super Owner can configure the key from Settings instead. |

## 4. Official SaaS Mode

Set the following values for the official SaaS deployment:

```bash
KEINAGE_DEPLOYMENT_MODE=official-saas
BILLING_MODE=stripe
PLAN_ENFORCEMENT_MODE=billing
```

Missing secrets, weak settings, or incomplete billing configuration can cause production incidents. `KEINAGE_DEPLOYMENT_MODE=official-saas` enables strict startup validation.

### 4.1 Official SaaS Environment Variables

| Category | Variable | Description |
| --- | --- | --- |
| App | `KEINAGE_DEPLOYMENT_MODE` | Set to `official-saas`. |
| App | `APP_PUBLIC_ORIGIN` | Canonical browser origin, for example `https://app.keinage.com`. |
| DB | `DATABASE_URL` | Connection string for RDS PostgreSQL or another PostgreSQL service. |
| Proxy | `TRUST_PROXY_HEADERS` | Set to `true` only when every request passes through ALB, CloudFront, Nginx, or another trusted proxy. |
| Billing | `BILLING_MODE` | Set to `stripe`. |
| Billing | `PLAN_ENFORCEMENT_MODE` | Set to `billing`. |
| Stripe | `STRIPE_SECRET_KEY` | Stripe API secret key. |
| Stripe | `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret. |
| Stripe | `STRIPE_PRICE_LITE_MONTHLY` / `STRIPE_PRICE_LITE_YEARLY` | Monthly / yearly Lite price IDs. |
| Stripe | `STRIPE_PRICE_STANDARD_MONTHLY` / `STRIPE_PRICE_STANDARD_YEARLY` | Monthly / yearly Standard price IDs. |
| Stripe | `STRIPE_PRICE_STANDARD_PLUS_MONTHLY` / `STRIPE_PRICE_STANDARD_PLUS_YEARLY` | Monthly / yearly Standard+ price IDs. |
| Storage | `S3_REGION` / `S3_BUCKET` | AWS S3 region and bucket. |
| Storage | `S3_ENDPOINT` / `S3_INTERNAL_ENDPOINT` | Usually empty for AWS S3; set endpoints for S3-compatible services. |
| Storage | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Leave empty when using an IAM role on AWS. Set both for local testing or S3-compatible services. |
| Storage | `S3_FORCE_PATH_STYLE` | Usually `true` for RustFS / MinIO and `false` for AWS S3. |
| Storage | `S3_PRESIGNED_UPLOAD_EXPIRES_SECONDS` | Lifetime of browser direct-PUT signed URLs. |
| Delivery | `STORAGE_DELIVERY_MODE` | Use `cloudfront-signed-url` for private CloudFront delivery. |
| Delivery | `STORAGE_PUBLIC_BASE_URL` | Application `/uploads` URL returned to browsers. |
| Delivery | `STORAGE_CDN_BASE_URL` | CloudFront distribution base URL. |
| Delivery | `CLOUDFRONT_KEY_PAIR_ID` / `CLOUDFRONT_PRIVATE_KEY` | Credentials used to sign CloudFront URLs. |
| Delivery | `CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS` | Signed URL lifetime. |
| Auth | `GOOGLE_OAUTH_ENABLED` | Set to `true` to enable Google OAuth/OIDC. |
| Auth | `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client from Google Cloud Console. |
| Auth | `WEBAUTHN_ENABLED` / `WEBAUTHN_OWNER_REQUIRED` | Configure to enable and require Passkeys. |
| Auth | `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN` | WebAuthn relying-party settings. |
| Mail | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Registration, reset, and important-notice email. |
| Contact | `CONTACT_SMTP_*` / `CONTACT_TO_EMAIL` | SMTP for the contact form. The form is disabled when unset. |
| Super Owner | `SUPER_OWNER_EMAIL` / `SUPER_OWNER_BOOTSTRAP_ENABLED` / `SUPER_OWNER_REQUIRE_GOOGLE` | Initial bootstrap settings for the operator account. |
| Audit | `AUDIT_LOG_ENABLED` / `AUDIT_LOG_IP_HASH_SECRET` / `AUDIT_LOG_RETENTION_DAYS` | Audit logging, IP hash secret, and retention. A positive retention value removes expired logs at container startup; unset or `0` disables deletion. |

Always manage Stripe price IDs through environment variables. Never place real IDs in source code or public documentation. `getBillingConfig()` in `src/lib/plans.ts` reads the mapping from the environment.

Audit cleanup can also be run with `pnpm audit:cleanup`. The same command may be scheduled through cron or another scheduler. A PostgreSQL advisory lock ensures that only one process deletes records when multiple processes run concurrently. `AUDIT_LOG_ENABLED=false` disables persistence of new audit logs but does not disable retention cleanup for existing logs. Cleanup failures are logged without exposing the records being deleted and do not prevent the server from starting.

### 4.2 Scheduled Maintenance Cleanup

`pnpm maintenance:cleanup` performs a dry run and reports expired `auth_sessions`, Google OAuth flows, Owner/Shared signup requests, processed Stripe events beyond retention, and expired direct-upload sessions. Run `pnpm maintenance:cleanup -- --execute` to delete them.

Change retention with `MAINTENANCE_SIGNUP_RETENTION_DAYS` (default: 30 days) and `STRIPE_EVENT_RETENTION_DAYS` (default: 90 days). Incomplete signup requests are removed after expiration; completed requests are removed after the retention period. Only `processed` and `ignored` Stripe events are removed; `processing` and `failed` events remain available for retry. Direct uploads receive a one-hour completion grace period after the signed URL expires. Cleanup removes only unregistered S3 objects associated with expired sessions. If a registered media record exists, the object remains and only the session is removed.

With `--orphan-media`, cleanup reports the count and total size of local/S3 objects older than `ORPHAN_MEDIA_MIN_AGE_DAYS` (default: 7 days) that are not referenced by `media_items`. To avoid accidental deletion, the initial implementation does not delete orphan media even when combined with `--execute`.

Self-hosted operators may run cleanup manually when needed. Official SaaS deployments should schedule the same command through EventBridge, CronJob, or an equivalent service. Inside the container, use `node maintenance-cleanup.cjs` for a dry run and `node maintenance-cleanup.cjs --execute` for deletion. A PostgreSQL advisory lock limits execution to one process.

## 5. Billing Unit and Owner Scope

The billing unit in Keinage is the Owner user. One Owner owns boards, media, settings, and Shared users.

- Paid subscriptions belong to an Owner.
- Shared users are not billing units.
- Adding Shared users does not create an additional charge.
- Board, image, storage, video, and other limits are evaluated from total usage in the Owner scope.
- A board cannot be shared across multiple Owners.

## 6. Plan Limits

| Plan | Boards | Images | Total storage | Per-file limit | Max resolution | Video | Scheduling | Extended templates | Menu images | Device status |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Free | 1 | 3 | 300 MB | 5 MB | 1920 px | No | No | No | No | No |
| Lite | 10 | Unlimited | 5 GB | 100 MB | 1920 px | Yes | Time / weekday | Yes | No | Yes |
| Standard | 100 | Unlimited | 20 GB | 500 MB | 3840 px | Yes | Time / weekday / date | Yes | Yes | Yes |
| Standard+ | 300 | Unlimited | 100 GB | 2 GB | 3840 px | Yes | Time / weekday / date | Yes | Yes | Yes |
| Self-hosted / Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Yes | Time / weekday / date | Yes | Yes | Yes |

These limits do not apply when `PLAN_ENFORCEMENT_MODE=unlimited`. With `PLAN_ENFORCEMENT_MODE=billing`, the effective plan is resolved from the Owner's Stripe subscription and enforced in both APIs and display payloads.

During a scheduled downgrade or cancellation, the current plan remains active until the end of the billing period. Keinage automatically selects active-board candidates that fit the future plan, and the Owner can change the selection on the Billing page.

## 7. Storage

### 7.1 Local Storage

When S3 connection settings are empty, media is stored in local `uploads/`. Docker Compose volumes or mounts contain uploaded files and must be included in backups. Removing them deletes the files.

### 7.2 AWS S3 with an IAM Role

On AWS, set `S3_REGION` and `S3_BUCKET`, and leave `S3_ENDPOINT` and static access keys empty. The application uses the AWS SDK default credential provider chain.

```bash
S3_REGION=ap-northeast-1
S3_BUCKET=keinage-storage-prod
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PRESIGNED_UPLOAD_EXPIRES_SECONDS=900
```

When using S3 storage, videos are uploaded directly from the browser to S3. Configure bucket CORS to allow `PUT` and `HEAD` from the Keinage origin, permit the `Content-Type` header, and expose `ETag`.

### 7.3 Private S3 with CloudFront Signed URLs

Use CloudFront signed URLs to deliver content while keeping the S3 bucket private. Browsers receive only `/uploads/<mediaId>`. Keinage checks Owner / Board visibility, then returns a 302 redirect to a short-lived CloudFront signed URL.

```bash
STORAGE_DELIVERY_MODE=cloudfront-signed-url
STORAGE_PUBLIC_BASE_URL=https://app.keinage.com/uploads
STORAGE_CDN_BASE_URL=https://storage.keinage.com
CLOUDFRONT_KEY_PAIR_ID=Kxxxxxxxxxxxx
CLOUDFRONT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS=300
```

### 7.4 S3-compatible Storage such as RustFS / MinIO

Configure an endpoint, path-style addressing, and static credentials for RustFS, MinIO, and similar services.

```bash
S3_INTERNAL_ENDPOINT=http://rustfs:9000
S3_REGION=us-east-1
S3_BUCKET=keinage-media
S3_ACCESS_KEY_ID=rustfsadmin
S3_SECRET_ACCESS_KEY=rustfsadmin
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://localhost:9000/keinage-media
```

The application container prefers `S3_INTERNAL_ENDPOINT`. For direct browser delivery, set `S3_PUBLIC_BASE_URL` to an address reachable by the browser.

Quick RustFS setup:

1. Uncomment the `rustfs` service in `docker-compose.yml`.
2. Set `S3_INTERNAL_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE` in `.env`.
3. Run `docker compose up -d db rustfs app`.
4. Create the `keinage-media` bucket in the RustFS web UI.

## 8. Authentication, Email, and Super Owner

### 8.1 SMTP

Configure `SMTP_*` to send Owner registration links, Shared user invitations, PIN / password resets, and important account or billing notifications.

```bash
APP_PUBLIC_ORIGIN=https://keinage.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your-password-here
SMTP_FROM=noreply@example.com
```

Without SMTP, unauthenticated Owner signup and PIN-reset email flows are disabled by default. For local development only, enable direct signup-link previews with `ALLOW_UNAUTHENTICATED_SIGNUP_PREVIEW=true` and a localhost `APP_PUBLIC_ORIGIN`.

### 8.2 Google OAuth/OIDC

To enable Owner registration, Shared user registration, and login through Google, register this redirect URI with the OAuth client in Google Cloud Console:

```text
${APP_PUBLIC_ORIGIN}/api/auth/google/callback
```

```bash
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

Do not use `0.0.0.0` in `APP_PUBLIC_ORIGIN` or the redirect URI. Use `http://localhost:3000` for local development.

### 8.3 Passkeys

Passkeys can provide two-factor authentication for Owner accounts.

```bash
WEBAUTHN_ENABLED=true
WEBAUTHN_OWNER_REQUIRED=true
WEBAUTHN_RP_ID=keinage.example.com
WEBAUTHN_RP_NAME=Keinage
WEBAUTHN_ORIGIN=https://keinage.example.com
```

Production environments require HTTPS. Browser rules allow `http://localhost:3000` for local development.

### 8.4 Super Owner

Super Owner is a privileged operator account for the official SaaS service or a public instance. There is no default administrator account or initial password.

```bash
SUPER_OWNER_EMAIL=admin@example.com
SUPER_OWNER_BOOTSTRAP_ENABLED=true
SUPER_OWNER_REQUIRE_GOOGLE=true
```

For official SaaS, enable Google OAuth/OIDC and set `SUPER_OWNER_REQUIRE_GOOGLE=true`. After creating the Super Owner, you may return `SUPER_OWNER_BOOTSTRAP_ENABLED` to `false`.

## 9. Migration and Deployment Notes

- Run `pnpm build` before production deployment.
- Run database migrations exactly once before starting the application. Avoid running migrations concurrently from multiple application instances.
- The Docker entrypoint runs migrations before startup. When horizontally scaling, consider separating the migration job from application startup.
- Inject `DATABASE_URL`, Stripe secrets, CloudFront private keys, SMTP passwords, and Google client secrets through a secrets manager or environment variables. Do not commit them to Git.
- Stripe webhook endpoints verify the raw body with `STRIPE_WEBHOOK_SECRET`. Do not let a proxy or middleware modify the body.
- When changing Stripe price IDs, update the Stripe prices and environment mapping first so delayed webhooks from old subscriptions can still be reconciled.
- Verify CORS and bucket policies before deploying S3 direct uploads.
- For CloudFront signed URLs, combine the S3 public access block with CloudFront Origin Access Control.
- Enable `TRUST_PROXY_HEADERS=true` only when a trusted proxy overwrites headers such as `x-forwarded-for`.
- Audit logs never store passwords, tokens, secrets, Stripe signatures, or WebAuthn challenges. IP addresses are hashed.

## 10. Related Documentation

- [SPEC.md](./SPEC.md) - User-facing specification
- [DESIGN.md](./DESIGN.md) - Internal design
- [API.md](./API.md) - Page and API routes
- [SECURITY.md](./SECURITY.md) - Security settings for production and official SaaS deployments
