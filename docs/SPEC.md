<p align="center">
  English | <a href="./SPEC.ja.md">日本語</a>
</p>

# Keinage Specification

Last updated: June 8, 2026

## 1. Purpose

This document describes Keinage's primary features and behavior from a user's perspective. See [DESIGN.md](./DESIGN.md) for internal design and [API.md](./API.md) for page and API routes.

Keinage is a digital signage web application that reflects dashboard changes on display devices in real time. Images, videos, messages, clocks, weather, call numbers, and other content are edited through purpose-specific templates.

## 2. Users and Permissions

### 2.1 User Types

| Type | Description |
| --- | --- |
| Owner user | Owns a workspace, including its boards, media, settings, and Shared users. |
| Shared user | A collaborator invited by an Owner who can edit the Owner's boards. |

Each board belongs to exactly one Owner and cannot be shared across multiple Owners. An Owner cannot be deleted or demoted to the general role.

### 2.2 Roles

| Role | Primary use | Capabilities |
| --- | --- | --- |
| `admin` | Owner / administrator | Board editing, media management, user management, and operational settings |
| `general` | General operator | Board editing and personal account settings |

Typical admin-only features include Shared user invitations, user editing, weather-region settings, image-resize limits, and bulk management of uploaded media.

Only an Owner `admin` may perform actions that affect billing, payment methods, subscription changes, cancellation, Owner account deletion, organization name, or Owner-scope security settings such as full-authentication lifetime. A Shared user with `admin` may manage boards, media, users, and operational settings, but cannot perform Owner-only actions.

## 3. Authentication and Signup

### 3.1 Authentication Methods

Choose one authentication method when creating a user:

| Method | Description |
| --- | --- |
| Email + password | Stores a password hash in the application. |
| Google account | Authenticates through Google OAuth/OIDC and stores no password. |

Authentication methods **cannot currently be changed** after account creation. Google users authenticate with the Google button on `/pin/login`.

### 3.2 Owner Signup

Owner registration starts at `/signup`.

Email + password:

1. Enter a user ID, email address, and phone number.
2. Keinage sends a registration URL.
3. Set a password at that URL.
4. Keinage sends a registration-completion email.
5. Set a six-digit PIN and enter the dashboard.

Google account:

1. Start Google authentication from `/signup`.
2. Keinage obtains a verified email address.
3. If no existing user conflicts, Keinage creates the Owner.
4. An application user ID is generated from the local part of the Google email address.
5. Keinage sends a registration-completion email.
6. Set a six-digit PIN and enter the dashboard.

### 3.3 Shared User Signup

An `admin` invites Shared users from `/users`.

1. The admin specifies a user ID, email address, and role.
2. Keinage sends a registration URL to the invitee.
3. The invitee registers with email + password or a Google account.
4. Keinage sends a registration-completion email.
5. The user sets a six-digit PIN and enters the dashboard.

For Google registration, the Google email must match the invited email address.

Active Shared users and unexpired invitations count toward the plan limit: Free 3, Lite 10, Standard 100, and Standard+ 300. Self-hosted / Unlimited has no limit. New invitations cannot be created at the limit.

After a downgrade, users are not deleted. Users beyond the new limit become `inactive_due_to_plan` and cannot log in. An `admin` can review usage and exchange which Shared users remain active on `/users`. Pending invitations also count, and invitations beyond the limit cannot complete.

Registration-completion email follows `Accept-Language`, includes an acknowledgement and login URL, and does not roll back registration if SMTP is unavailable or delivery fails.

The first dashboard visit after Owner registration shows an onboarding dialog with an acknowledgement, a create-board action, and a plan-review action. Acknowledgement is stored in `owner_onboarding_acknowledged_at`; the dialog is not shown again for that Owner and is never shown to Shared users.

### 3.4 Super Owner

Super Owner is a privileged operator role for official SaaS announcements and maintenance operations. It uses the normal Owner registration and login flow. Only an Owner with a verified email matching `SUPER_OWNER_EMAIL` is eligible for initial bootstrap.

There can be only one Super Owner. Keinage has no default administrator, initial password, hidden URL, or UI/API for promoting arbitrary users. With `SUPER_OWNER_REQUIRE_GOOGLE=true`, only an Owner authenticated through Google OIDC can become Super Owner.

Super Owner can create operator announcements on `/announcements`, including type, severity, target plan, publication window, acknowledgement requirement, and email delivery. Regular users see only currently published announcements that match their effective plan.

Super Owner can view registered users at `/super-owner/users`. The directory is limited to user ID, email, role, attribute, organization name, plan, status, and creation time. It does not expose passwords, PIN hashes, phone numbers, authentication history, lock expiration, or similar private data. Shared users display their Owner's organization and plan.

Unread important announcements appear in the dashboard header. Required announcements also remain fixed in the lower-right corner until acknowledged. `acknowledged_at` is stored per user. Publishing with `send_email=true` attempts delivery through the existing SMTP configuration.

The audit-log API exposes important authentication, billing, Stripe webhook, account deletion, Passkey, and announcement events. Audit logs never contain passwords, tokens, secrets, card data, or WebAuthn challenges. IP addresses are hashed.

### 3.5 Login

| Page | Method | Purpose |
| --- | --- | --- |
| `/pin/login` | Email or user ID + password | Full authentication |
| `/pin/login` | Google account | Full authentication |
| `/pin` | Six-digit PIN | Quick reauthentication on the same device |

Successful full authentication issues a normal session and device-specific authentication state. PIN login targets the last user who fully authenticated on that device.

### 3.6 Passkey Two-factor Authentication

When `WEBAUTHN_ENABLED=true` and `WEBAUTHN_OWNER_REQUIRED=true`, Owner accounts require an additional WebAuthn / Passkey step.

- Only Owner accounts are affected.
- After password, Google, or PIN authentication, users without a Passkey go to `/passkey/setup`; users with one go to `/passkey/verify`.
- The dashboard and authenticated APIs remain unavailable until verification completes.
- Owners can add and remove Passkeys in Settings. The final credential cannot be removed while Passkeys are required.
- Passkey failures are limited to five attempts per bucket within 24 hours.
- Production requires HTTPS. Local development may use `http://localhost:3000`.

### 3.7 PIN and Authentication Lifetime

- A PIN is a user-specific six-digit number.
- Users without a PIN cannot use PIN login.
- Full authentication lasts 30 days by default and at most 365 days.
- Only an Owner `admin` can change this lifetime.
- Normal session cookies last 24 hours.
- After full authentication expires, even a correct PIN requires another login through `/pin/login`.
- Password and PIN authentication are attempt limited. Five failures in one bucket within 24 hours cause a temporary block.

### 3.8 PIN Reset and Account Deletion

Start a PIN reset at `/pin/forgot`. The emailed reset URL expires after 30 minutes.

Start Owner deletion at `/delete-account`. Confirmation deletes the Owner's boards, media, Shared users, and settings. In official SaaS mode, an active Stripe subscription is cancelled immediately, and Keinage becomes unavailable even if paid time remains. Prorated refunds are generally not provided.

## 4. Board Editing

### 4.1 Boards

A board is one screen layout shown on a display device. The dashboard supports:

- Creating, editing, and deleting boards
- Selecting a template
- Renaming a board
- Switching public/private visibility
- Configuring theme colors, fonts, slide intervals, and other settings
- Managing images, videos, and messages

The display URL is `/<boardId>`. Inactive boards are not publicly displayable.

Public board displays and board settings include a share button. Supported devices open the Web Share API; other environments copy the public board URL to the clipboard. Private boards do not show the button.

Display screens send a heartbeat about every five minutes. On `/status`, administrators can see the last access time, User-Agent, and an Online indicator based on activity within five minutes for each device and board pair. Multiple boards on one device are tracked separately. Device status is available for Self-hosted / Unlimited and Lite or higher plans. Manual device names, IP storage, long-term display history, and Proof of Play are out of scope.

### 4.2 Templates

| ID | Display name | Primary use |
| --- | --- | --- |
| `simple` | Simple Board | Image/video slideshow and text ticker |
| `photo-clock` | Photo Clock | Photo slideshow with date and time |
| `retro` | Retro Board | Dot-matrix station-board style display |
| `message` | Message Board | Messages added from the dashboard or external integrations |
| `call-number` | Call Number | Queue numbers for counters and restaurants |
| `clinic-hours` | Clinic Hours | Weekly/monthly hours, closed days, and weekday schedules |
| `restaurant-menu` | Restaurant Menu | Up to three columns and five items per column, with prices and food images |
| `qr-info` | QR Information | Up to two large QR codes with descriptions |

The Retro template lets editors set text per row and column and adjust font size and column width. Clinic Hours supports weekday hours plus date-specific closures or special hours and can show current time and weather.

Every template uses a 1080 px-high reference canvas and scales the entire board to the display height. Font-size settings are design-point `pt` values where 1 pt appears approximately as 1 px at 1080 px. Text, icons, QR codes, and spacing retain their proportions across tablets, Full HD, and 4K displays, while width follows the display aspect ratio.

Simple Board and Photo Clock determine the current slide from server-based time. Multiple devices showing the same board therefore display the same slide, including devices opened later. Small timing differences from network latency and video playback position are not guaranteed to be synchronized.

### 4.3 Media

- Images: JPEG, PNG, WebP, GIF
- Videos: MP4, WebM
- Maximum file size and total storage depend on the plan.
- Storage: local `uploads/` or S3-compatible storage.
- Public media may use CDN URLs; private media uses the authorized `/uploads/` route.
- Images can be resized to a configured longest edge.
- Thumbnails are generated with a 600 px longest edge.
- GIF originals remain animated and unresized; thumbnails are static JPEGs.
- Image/video dimensions are recorded and checked against video and resolution limits.
- `simple` and `photo-clock` also enforce per-board media count, video count, and video-duration limits.
- Downgrades never automatically delete or resize existing media. New uploads are blocked while current usage exceeds the active plan.
- Unavailable or over-resolution video is replaced by guidance on the board and becomes usable again after upgrading.
- Video slides can advance after a configured duration or wait for the video to end.

| Plan | Total storage | Per-file limit |
| --- | --- | --- |
| Free | 300 MB | 5 MB |
| Lite | 5 GB | 100 MB |
| Standard | 20 GB | 500 MB |
| Standard+ | 100 GB | 2 GB |
| Self-hosted / Unlimited | Unlimited | Unlimited |

Per-board limits for `simple` and `photo-clock`:

| Plan | Media per board | Videos per board | Duration per video |
| --- | --- | --- | --- |
| Free | 3 | 0 | Unavailable |
| Lite | 10 | 1 | 30 seconds |
| Standard | 20 | 1 | 3 minutes |
| Standard+ | 30 | 2 | 5 minutes |
| Self-hosted / Unlimited | Unlimited | Unlimited | Unlimited |

### 4.4 Messages

Messages belong to a board and may specify priority, type (`info`, `notice`, or `alert`), and expiration. Expired messages are hidden. Message Board also shows posting time. Messages are the primary content in Message Board and Call Number templates.

### 4.5 Call Screen

The Call Number template supports `/call/<boardId>`.

- Enter with the board's six-digit call passcode.
- The dashboard displays the call URL and QR code.
- Active messages on the board act as the call-number queue.

### 4.6 Scheduled Display

Simple Board and Photo Clock can filter media using the display browser's local time. Simple Board can apply the same conditions to messages.

| Target | Conditions |
| --- | --- |
| Image/video | Always, time range, weekday, date range |
| Message | Always, time range, weekday, date range |
| Fallback image | Used when no content matches; defaults to a black screen with the Keinage logo |

| Plan | Scheduling |
| --- | --- |
| Free | Unavailable |
| Lite | Time range and weekday |
| Standard | Time range, weekday, and date range |
| Standard+ | Time range, weekday, and date range |
| Self-hosted / Unlimited | Time range, weekday, and date range |

### 4.7 Templates by Plan

| Plan | Available templates | Restaurant menu images |
| --- | --- | --- |
| Free | Five standard templates only | Unavailable |
| Lite | All templates | Unavailable |
| Standard | All templates | Available |
| Standard+ | All templates | Available |
| Self-hosted / Unlimited | All templates | Available |

### 4.8 Active Boards During a Scheduled Downgrade

During a scheduled downgrade or end-of-period cancellation, current board limits remain active until the end of the billing period.

Keinage automatically selects boards that fit the future plan, prioritizing most recently displayed, updated, then created. An `admin` can change candidates on the Billing page before transition. Only an Owner `admin` may perform payment, subscription, or cancellation actions.

At transition, selected boards remain active and the rest become inactive due to plan limits. Missing or invalid candidates are regenerated with the same ordering.

The Billing page shows when the current plan ends, when future limits apply, and which current resources exceed those limits: boards, images, storage, video availability, video resolution, and per-file size. It also provides cleanup guidance and upgrade paths when the current account is over limit.

### 4.9 Shared User Limits

| Plan | Shared user limit |
| --- | ---: |
| Free | 3 |
| Lite | 10 |
| Standard | 100 |
| Standard+ | 300 |
| Self-hosted / Unlimited | Unlimited |

Active Shared users and unexpired invitations count. Disabled or `inactive_due_to_plan` users and expired, completed, or cancelled invitations do not. `/users` warns at 80% usage and disables invitations at the limit.

## 5. Display and Real-time Updates

Display screens subscribe to Server-Sent Events and automatically reflect dashboard and API changes.

| Change | Display behavior |
| --- | --- |
| Board settings | Refetch board data |
| Media creation, reorder, or deletion | Refetch media |
| Message creation, update, or deletion | Refetch messages |

Weather uses an internal provider shared by every board. OpenWeather forecasts are refreshed and recached hourly per City ID, so multiple boards do not independently call the external API. The display uses a consistent Keinage monochrome icon set rather than provider images. The horizontal card shows the configured city, today's condition, high and low temperatures, and precipitation probabilities for 0-6, 6-12, 12-18, and 18-24. An admin selects the country and city; the Super Owner configures the OpenWeather API key.

## 6. Settings

### 6.1 User Settings

Each user can change:

- Theme: `system`, `light`, or `dark`
- Display language
- User ID
- Email address
- Password
- PIN

Google-authenticated users cannot change a password.

### 6.2 Administrative Settings

An `admin` can change:

- Weather region
- Image-resize limit
- Uploaded-file inspection and deletion
- Application version display
- QR codes for dashboard and call-screen URLs

An Owner `admin` can additionally change full-authentication lifetime and organization name, delete the Owner account, and perform billing, payment-method, subscription-change, and cancellation operations.

## 7. Operational Assumptions

- Features that send email require SMTP configuration.
- Registration and reset URLs use `APP_PUBLIC_ORIGIN`.
- Local development should use `APP_PUBLIC_ORIGIN=http://localhost:3000`. Do not use a bind address such as `0.0.0.0`, which can cause OAuth state-cookie mismatches.
- Google OAuth/OIDC requires `${APP_PUBLIC_ORIGIN}/api/auth/google/callback` as a redirect URI in Google Cloud Console.
