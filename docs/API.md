# Keinage Routing Reference

最終更新: 2026-04-30

## 1. このドキュメントの目的

このドキュメントは Keinage の画面ルートと API Route Handler を一覧できるようにまとめます。詳細な利用者向け仕様は [SPEC.md](./SPEC.md)、内部設計は [DESIGN.md](./DESIGN.md) を参照してください。

## 2. ルーティング全体

```mermaid
flowchart TB
  root["/"] --> board["/<boardId>"]
  root --> dashboard["/boards, /media, /settings, /users"]
  root --> auth["/signup, /pin, /pin/login, /passkey/*"]
  root --> call["/call/<boardId>"]
  root --> api["/api/*"]
  root --> uploads["/uploads/*"]
```

## 3. 画面ルート

### 3.1 公開・表示画面

| Path | 内容 | 認証 |
| --- | --- | --- |
| `/` | 初期導線。状態に応じてボード/ダッシュボード/認証へ誘導 | 状況による |
| `/<boardId>` | 公開ボード表示 | 不要 |
| `/call/<boardId>` | 呼び出し番号テンプレート用の操作画面 | ボードの call passcode |

### 3.2 ダッシュボード

| Path | 内容 | 認証 |
| --- | --- | --- |
| `/boards` | ボード一覧 | 必要 |
| `/boards/new` | ボード作成 | 必要 |
| `/boards/<boardId>` | ボード編集 | 必要 |
| `/media` | アップロード済みメディア管理 | `admin` |
| `/billing` | プランとお支払い管理 | `admin` / Billing 有効時 |
| `/status` | 使用量、表示端末状態、バージョン情報 | `admin` |
| `/settings` | ユーザー設定・管理設定 | 必要 |
| `/users` | Shared user 管理 | `admin` |
| `/delete-account` | Owner アカウント削除リクエスト | Owner / `admin` |

### 3.3 認証・登録

| Path | 内容 | 認証 |
| --- | --- | --- |
| `/signup` | Owner 登録開始 | 不要 |
| `/signingup` | Owner 登録 URL の送達待ち | `signup-request-id` Cookie |
| `/signup/<token>` | Owner パスワード設定 | 登録 token |
| `/signup/shared?token=<token>` | Shared user 登録 | 招待 token |
| `/pin/setup` | 初期 PIN 設定 | 一時セットアップセッション |
| `/pin` | PIN ログイン | `device-auth` Cookie |
| `/pin/login` | フル認証ログイン | 不要 |
| `/pin/forgot` | PIN リセット依頼 | 不要 |
| `/pin/reset/<token>` | PIN リセット | リセット token |
| `/passkey/setup` | Owner Passkey 初回登録 | Passkey 未完了を含む `auth-session` |
| `/passkey/verify` | Owner Passkey 追加認証 | Passkey 未完了を含む `auth-session` |
| `/deleting-account/<token>` | アカウント削除確定 | 削除 token |
| `/deleted-account` | アカウント削除完了 | 不要 |

## 4. Cookie

| Cookie | 用途 |
| --- | --- |
| `auth-session` | 認証済みセッション |
| `device-auth` | 端末単位のフル認証履歴 |
| `signup-request-id` | `/signingup` 用の Owner 仮登録識別 |
| `google-oauth-state` | Google OAuth/OIDC callback の state 検証 |

`NODE_ENV=production` では認証系 Cookie に `Secure` 属性が付きます。ローカル開発では HTTP 動作のため `Secure` を付与しません。

## 5. 認証 API

### 5.1 Owner / Shared 登録

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/credentials/setup` | Owner 仮登録を作成し、登録 URL を発行 | 不要 |
| `POST` | `/api/auth/credentials/setup/resend` | Owner 登録 URL を再送・再発行 | `signup-request-id` Cookie |
| `POST` | `/api/auth/credentials/complete` | Owner のパスワード登録を完了 | 登録 token |
| `POST` | `/api/auth/credentials/shared/complete` | Shared user のパスワード登録を完了 | 招待 token |
| `GET` | `/api/auth/google/start` | Google OAuth/OIDC を開始して Google へ redirect | 不要 |
| `POST` | `/api/auth/google/start` | Google OAuth/OIDC 認可 URL を JSON で返す | 不要 |
| `GET` | `/api/auth/google/callback` | Google callback を処理し、登録またはログインを完了 | state Cookie |
| `POST` | `/api/auth/pin/setup` | 初期 PIN を設定 | 一時セットアップセッション |

`GET /api/auth/google/start` は `mode=login|owner-signup|shared-signup`、`redirectTo`、`token` を受け付けます。Google OAuth/OIDC は Authorization Code + PKCE、nonce、opaque state、JWKS 署名検証を使います。

Owner / Shared user の登録完了時は、`SMTP_HOST` などの既存SMTP設定を使って登録完了メールを送信します。本文は `Accept-Language` に従ってローカライズし、謝辞と `/pin/login` のログイン URL を含めます。SMTP 未設定または送信失敗時も、ユーザー作成やセッション発行は取り消しません。

### 5.2 ログイン・ログアウト

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/credentials/login` | メールアドレスまたはユーザーID + パスワードでログイン | 不要 |
| `POST` | `/api/auth/pin/verify` | PIN ログイン | `device-auth` Cookie |
| `POST` | `/api/auth/pin/logout` | 現在のセッションを削除 | 任意 |
| `GET` | `/api/auth/pin/status` | PIN ログイン対象ユーザーと期限情報を取得 | 任意 |
| `GET` | `/api/auth/webauthn/status` | WebAuthn / Passkey 要求状態を取得 | Passkey 未完了を含む `auth-session` |
| `POST` | `/api/auth/webauthn/register/start` | Passkey 登録 options を発行 | Owner / Passkey 未完了可 |
| `POST` | `/api/auth/webauthn/register/finish` | Passkey 登録 response を検証し credential を保存 | Owner / Passkey 未完了可 |
| `POST` | `/api/auth/webauthn/authenticate/start` | Passkey 認証 options を発行 | Owner / Passkey 未完了可 |
| `POST` | `/api/auth/webauthn/authenticate/finish` | Passkey 認証 response を検証しセッションを完了 | Owner / Passkey 未完了可 |

`POST /api/auth/credentials/login`、`POST /api/auth/pin/verify`、Passkey 完了 API は失敗回数制限を行います。`TRUST_PROXY_HEADERS=true` のときだけ `x-forwarded-for` / `x-real-ip` を client IP として信用します。

Owner signup、signup resend、Google OAuth start にも rate limit を適用します。Google OAuth / OIDC の失敗ログには authorization code、access token、ID token、client secret を出力せず、外部 provider の HTTP status のみ記録します。

### 5.3 アカウント設定

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `PATCH` | `/api/auth/password/change` | パスワード変更 | 必要 |
| `PATCH` | `/api/auth/pin/change` | PIN 変更 | 必要 |
| `POST` | `/api/auth/pin/forgot` | PIN リセット URL を送信 | 不要 |
| `POST` | `/api/auth/pin/reset` | PIN リセット token で PIN を更新 | リセット token |
| `POST` | `/api/auth/account-deletion/request` | Owner アカウント削除 URL を送信 | Owner / `admin` |
| `POST` | `/api/auth/account-deletion/complete` | Owner アカウント削除を確定。Stripe有効時はサブスクリプションを即時キャンセルしてから削除 | 削除 token |
| `GET` | `/api/account/webauthn/credentials` | Owner の登録済み Passkey 一覧を取得 | Owner |
| `DELETE` | `/api/account/webauthn/credentials` | Owner の Passkey を削除。必須設定中の最後の1件は削除不可 | Owner |
| `PATCH` | `/api/users/me` | 自分の表示テーマ・locale を更新 | 必要 |
| `POST` | `/api/owner/onboarding/acknowledge` | Owner 初回オンボーディング確認済み日時を保存 | Owner |
| `POST` | `/api/contact` | 問い合わせメール送信 | 必要 |

`/contact` は plan に応じて導線を出し分けます。Self-hosted / unlimited は GitHub Issues / Discussions、Free は Upgrade 推奨 + GitHub Issues、Lite / Standard / Standard+ は SMTP 設定がある場合に問い合わせフォームを表示します。フォーム送信時の Owner 情報、送信ユーザー、現在の plan は server-side session から付与され、hidden input には持たせません。問い合わせ専用 SMTP は `CONTACT_SMTP_HOST`、`CONTACT_SMTP_PORT`、`CONTACT_SMTP_USER`、`CONTACT_SMTP_PASS`、`CONTACT_SMTP_FROM`、`CONTACT_TO_EMAIL` で設定します。未設定時は GitHub への fallback を表示します。送信 API は Owner + IP 単位で 1 時間 3 件までの rate limit を適用します。

## 6. ボード API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/boards` | 自分が編集できるボード一覧 | 必要 |
| `POST` | `/api/boards` | ボード作成 | 必要 |
| `GET` | `/api/boards/<id>` | ボード詳細 | 必要 |
| `PATCH` | `/api/boards/<id>` | ボード設定更新 | 必要 |
| `DELETE` | `/api/boards/<id>` | ボード削除 | 必要 |
| `GET` | `/api/public/boards/<id>` | 公開ボード詳細 | 不要 |
| `POST` | `/api/public/boards/<id>/heartbeat` | 表示端末の最終アクセス heartbeat | 表示権限 |

`GET /api/public/boards/<id>` はボード表示に必要な `boardPlan.watermark` を返します。この値は Owner の effective plan からサーバー側で算出され、plan code や subscription 詳細は公開しません。ブラウザ表示上のウォーターマークであり、完全な削除・改ざん防止は保証しません。

`POST /api/public/boards/<id>/heartbeat` は表示画面から約5分間隔で送られ、Self-hosted / unlimited または Lite 以上の Owner について、匿名 device key と表示中ボードの組み合わせごとに、User-Agent、最終アクセス日時を保存します。IPアドレスは保存しません。Private board では通常の表示権限確認を行います。

Owner退会時、`BILLING_MODE=stripe` かつキャンセル可能な Stripe subscription がある場合は Stripe の即時キャンセルに成功してからOwner削除へ進みます。キャンセルに失敗した場合、アカウントとデータは削除されません。退会済みOwnerのStripe IDは最小限のtombstoneとして保持し、遅延Webhookで有料プランが復活しないようにします。

ボード更新・削除後は対象ボードへ SSE イベントが発行されます。

### 6.1 Security Headers

全 route で `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`、`Cross-Origin-Opener-Policy` を返します。production では `Strict-Transport-Security` も返します。CSP は S3 presigned upload / CloudFront / Google Fonts / 外部画像などデプロイ先ごとの allowlist 調整が必要なため、固定ヘッダではなく `docs/SECURITY.md` に運用方針を記載します。

## 7. メディア API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/media` | DB 登録済みメディア一覧 | 必要 |
| `POST` | `/api/media` | メディアアップロード | 必要 |
| `POST` | `/api/media/direct/init` | S3 Presigned PUT URL 発行 | 必要 |
| `POST` | `/api/media/direct/complete` | S3 direct upload 完了登録 | 必要 |
| `PATCH` | `/api/media` | メディア並び順・表示時間更新 | 必要 |
| `DELETE` | `/api/media` | DB 登録済みメディアを一括削除 | `admin` |
| `PATCH` | `/api/media/<id>` | 1 件の表示時間などを更新 | 必要 |
| `DELETE` | `/api/media/<id>` | 1 件削除 | 必要 |
| `GET` | `/api/media/files` | ストレージ上のアップロード済みファイル一覧 | `admin` |
| `DELETE` | `/api/media/files` | ストレージ上のファイル削除 | `admin` |
| `GET` | `/uploads/<path>` | アップロード済みファイル配信 | 不要 |

アップロード対応形式は画像 JPEG/PNG/WebP/GIF、動画 MP4/WebM です。Content-Type とファイル拡張子が一致しないアップロードは拒否します。1 ファイルごとの最大サイズは effective plan の `maxUploadBytes` を優先して判定します。Self-hosted / unlimited では既定で無制限、`UPLOAD_MAX_BYTES` に正の整数を設定した場合は安全上限として適用します。`UPLOAD_MAX_BYTES=0` は無制限です。`simple` と `photo-clock` では、effective plan の `boardMediaItems`、`boardVideos`、`boardVideoDurationSeconds` により、ボード単位のメディア数、動画本数、動画ファイル長も制限します。サーバー経由アップロードと S3 direct upload init / complete は Owner 単位で rate limit を適用します。

新規アップロードの storage key は Owner / board scope を含みます。`STORAGE_DELIVERY_MODE=cloudfront-signed-url` の場合、board API のメディアURLは `/uploads/<mediaId>` 形式になり、`/uploads/<mediaId>` が認可後に CloudFront Signed URL へ 302 redirect します。署名付き配信を使わない public board のメディアは `S3_PUBLIC_BASE_URL`、`STORAGE_PUBLIC_BASE_URL`、`CLOUDFRONT_BASE_URL` のいずれかが設定されている場合に CDN URL として返されます。private board のメディアは `/uploads/<path>` route 経由の認可配信を維持します。

`GET /uploads/<path>` は、対象 storage key または対応するサムネイル元の `media_items` 参照がDBに存在しない場合は 404 を返します。これにより、退会時に物理削除へ失敗した残存ファイルや S3 direct upload が complete されずDB登録されなかった孤立オブジェクトは、raw storage key を知っていてもアプリ経由では配信されません。動画のシークと自然なループ再生のために `Range: bytes=...` に対応し、部分配信時は `206 Partial Content`、`Content-Range`、`Accept-Ranges: bytes` を返します。範囲外の要求は `416 Range Not Satisfiable` を返します。

S3 storage 利用時の動画アップロードは、ブラウザが `/api/media/direct/init` で Presigned PUT URL を取得し、S3 へ直接 PUT した後に `/api/media/direct/complete` で DB 登録します。Keinage API は署名発行前と完了登録前に Owner / board / plan / 容量 / 動画解像度を確認し、完了時は `HeadObject` で実体サイズと Content-Type を検証します。動画の長さは complete 時にサーバー側で保存済みオブジェクトを読み出して `ffprobe` で取得し、クライアント申告値は信用しません。complete されないオブジェクトはDB参照がないため配信対象になりません。S3 未設定時は既存の `/api/media` にフォールバックします。Multipart Upload と未完了 multipart cleanup は大容量アップロード最適化の後続課題です。

サーバー経由アップロードでは、動画は正式保存前に一時ファイルへ書き出し、`ffprobe` で width / height / rotation / duration を取得して plan の解像度制限とボード単位の動画時間制限を判定します。一時ファイルは判定後に削除され、制限超過時は正式保存されません。Lite は FHD 以下、Standard / Standard+ は 4K 以下を許可します。

アップロード時に画像・動画の `width` / `height` を、動画では `videoDurationSeconds` も `media_items` に保存します。既存メディアはダウングレード時に削除・変換しませんが、現在プランで動画が許可されない場合や保存済み寸法が解像度上限を超える場合、公開ボード API は対象メディアに `playbackStatus` を付与し、表示側は動画再生の代わりに案内 UI を表示します。ストレージ使用量、画像数、対象テンプレートのボード単位メディア数・動画本数・動画時間が現在プランの上限を超えている場合、新規アップロード、テンプレート変更、設定保存は Plan limit error として拒否されます。

## 8. メッセージ API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/boards/<id>/messages` | ボードのメッセージ一覧 | 必要 |
| `DELETE` | `/api/boards/<id>/messages` | ボードのメッセージ一括削除 | 必要 |
| `GET` | `/api/public/boards/<id>/messages` | 公開表示用メッセージ一覧 | 不要 |
| `POST` | `/api/messages` | メッセージ作成 | 必要 |
| `PATCH` | `/api/messages/<id>` | メッセージ更新 | 必要 |
| `DELETE` | `/api/messages/<id>` | メッセージ削除 | 必要 |

メッセージ作成・更新では `content`、`priority`、`expiresAt` に加え、種別 `kind` を指定できます。`kind` は `info`、`notice`、`alert` のいずれかで、省略時は `info` です。メッセージ変更後は対象ボードへ SSE イベントが発行されます。

## 9. ユーザー API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/users` | Owner 配下のユーザー、招待、Shared user利用数・上限を取得 | `admin` |
| `POST` | `/api/users` | Shared user 招待作成 | `admin` |
| `PATCH` | `/api/users/<id>` | Shared user のロール、プラン適用状態を更新 | `admin` |
| `DELETE` | `/api/users/<id>` | Shared user 削除 | `admin` |
| `GET` | `/api/super-owner/status` | Super Owner認証状態を確認 | `super_owner` |
| `GET` | `/api/super-owner/audit-logs` | 監査ログ一覧を取得。`action`、`result`、`actor_user_id`、`target_type`、`created_from`、`created_to`、`limit` で絞り込み | `super_owner` |
| `GET` | `/api/announcements` | 現在ユーザーに公開中の運営通知一覧 | 必要 |
| `POST` | `/api/announcements/<id>/read` | 運営通知を既読にする | 必要 |
| `POST` | `/api/announcements/<id>/acknowledge` | 確認必須の運営通知を確認済みにする | 必要 |
| `GET` | `/api/super-owner/announcements` | 運営通知の全件一覧 | `super_owner` |
| `POST` | `/api/super-owner/announcements` | 運営通知を作成 | `super_owner` |
| `PATCH` | `/api/super-owner/announcements/<id>` | 運営通知を編集 | `super_owner` |
| `POST` | `/api/super-owner/announcements/<id>/publish` | 運営通知を公開し、必要に応じてメール送信 | `super_owner` |
| `POST` | `/api/super-owner/announcements/<id>/archive` | 運営通知をアーカイブ | `super_owner` |

`POST /api/users`、Shared userのパスワード／Google登録完了、`PATCH /api/users/<id>` による再有効化は、effective plan の `sharedUsers` 上限をサーバー側で検証します。上限超過時は `403` と `code: "plan_limit_shared_user_count"`、`limit`、`usage` を返します。Shared userと招待は必ずOwnerスコープで絞り込み、他Ownerのユーザーは更新できません。

Owner user は削除できません。

Super Ownerは通常のOwner登録・ログイン経路で認証し、`SUPER_OWNER_*` 環境変数に一致する初回Ownerのみbootstrapされます。Super Owner専用APIは `requireSuperOwner()` によるサーバー側判定を必須とし、アクセスは監査ログに記録されます。

横断的な監査ログは `audit_logs` に保存されます。認証、Passkey、課金、Stripe webhook、退会、Super Owner 操作の主要イベントを記録し、IPアドレスはハッシュ化して保存します。パスワード、token、secret、Stripe署名、WebAuthn challenge は保存しません。

運営通知は `published` かつ公開期間内のものだけが通常ユーザーに返ります。対象プランはサーバー側で effective plan から判定します。`send_email=true` の通知は公開時に対象ユーザーへ `SMTP_HOST` など既存SMTP設定を使って送信を試行し、失敗しても公開自体は維持します。

## 10. Billing API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/billing/plan` | Owner の有効プラン状態を取得 | `admin` |
| `GET` | `/api/billing/board-activation` | 現在または予約中プランで有効にするボード候補を取得 | `admin` |
| `POST` | `/api/billing/board-activation` | 有効ボード候補を保存、または現在プランの有効ボードを適用 | `admin` |
| `POST` | `/api/billing/checkout` | 有料プランの Checkout Session を作成 | Owner `admin` |
| `POST` | `/api/billing/portal` | 支払い管理 Session を作成 | Owner `admin` |
| `POST` | `/api/billing/webhook` | 決済 webhook を署名検証し、Owner subscription を同期 | webhook signature |

`/api/billing/board-activation` は、ダウングレード予約中は `pending_active_board_ids` を保存し、現行プランへの即時適用時だけボードの `status` を更新します。

Checkout / Portal のように支払い方法・契約変更・解約につながる課金操作は Owner user の `admin` だけが実行できます。Shared user の `admin` は `/api/billing/plan` と `/api/billing/board-activation` で利用状況確認と有効ボード候補の調整を行えます。

`BILLING_MODE=disabled` では `/billing` 導線は表示されず、`/api/billing/webhook` は 404 を返します。webhook は raw body と `STRIPE_WEBHOOK_SECRET` で署名検証し、event id を保存して重複処理を避けます。

Stripe webhook は `customer.subscription.*` と `subscription_schedule.*` を受け取った時点で Stripe API から Subscription / Subscription Schedule を再取得し、現在 price、Subscription Item の `current_period_end`、`cancel_at`、`ended_at`、次 phase の price を同期します。下位プランへの変更予約や `cancel_at_period_end=true` を検知した時点で、移行先プラン上限に収まる `pending_active_board_ids` を自動生成します。優先順位は `boards.last_viewed_at`、`updated_at`、`created_at` の降順です。実際の切替時に pending 候補だけを `active` として残し、それ以外を `inactive_due_to_plan` にします。pending 候補が空または不正な場合も同じ優先順位で再選択し、全ボード無効化を避けます。

Billing 画面は `/api/billing/plan`、Owner usage、`/api/billing/board-activation` 相当の状態を組み合わせ、現在プランを利用できる期限、予約後のプラン、予約中プランや下位プラン候補で超過する項目を警告します。表示対象はボード数、画像数、ストレージ、動画可否、動画解像度、1ファイル上限です。

Plan 制限に到達した場合、ボード作成・更新やメディア追加 API は `403` と machine readable な `code` を返します。主な code は `plan_limit_board_count`、`plan_limit_storage`、`plan_limit_image_count`、`plan_limit_video_disabled`、`plan_limit_resolution`、`plan_limit_upload_size`、`plan_limit_template_disabled`、`plan_limit_board_media_count`、`plan_limit_board_video_count`、`plan_limit_board_video_duration` です。`PLAN_ENFORCEMENT_MODE=unlimited` では制限を適用しません。

## 11. 設定・補助 API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/settings` | Owner 設定取得 | `admin` |
| `PATCH` | `/api/settings` | Owner 設定更新 | `admin` / 一部 Owner `admin` |
| `GET` | `/api/board-devices` | 表示端末の最終アクセス状態を取得 | `admin` |
| `GET` | `/api/weather` | 天気情報取得 | 不要 |
| `GET` | `/api/version` | 現在バージョンと最新リリース情報 | 不要 |
| `GET` | `/api/network` | ネットワーク情報取得 | 不要 |

`/api/settings` の `authExpireDays` はOwnerスコープ全体のセキュリティ設定のため Owner user の `admin` だけが更新できます。`/api/weather` は外部天気 API の結果を一定時間キャッシュします。`/api/version` は GitHub Releases API を参照します。

## 12. SSE API

| Method | Path | 内容 | 認証 |
| --- | --- | --- | --- |
| `GET` | `/api/sse` | SSE 疎通用 endpoint | 不要 |
| `GET` | `/api/sse/<boardId>` | ボード単位の SSE stream | 不要 |

イベント名:

| Event | 発生契機 |
| --- | --- |
| `board-updated` | ボード更新・削除 |
| `media-updated` | メディア追加・並び替え・削除 |
| `message-updated` | メッセージ追加・更新・削除 |

## 13. 代表的なフロー

### 13.1 Owner 登録

```mermaid
sequenceDiagram
  participant U as User
  participant A as App
  participant M as SMTP or Preview

  U->>A: POST /api/auth/credentials/setup
  A->>M: Send signup URL
  U->>A: POST /api/auth/credentials/complete
  U->>A: POST /api/auth/pin/setup
  A-->>U: auth-session + device-auth
```

### 13.2 Google ログイン

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as App
  participant G as Google

  U->>A: GET /api/auth/google/start?mode=login
  A-->>U: Redirect to Google
  U->>G: Authorize
  G-->>U: Redirect callback
  U->>A: GET /api/auth/google/callback
  A-->>U: auth-session + device-auth
```

### 13.3 ボード更新

```mermaid
sequenceDiagram
  participant D as Dashboard
  participant A as API
  participant V as Board View

  D->>A: PATCH /api/boards/<id>
  A-->>V: SSE board-updated
  V->>A: GET /api/public/boards/<id>
```
