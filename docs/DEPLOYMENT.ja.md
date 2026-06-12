<p align="center">
  <a href="./DEPLOYMENT.md">English</a> | 日本語
</p>

# Keinage Deployment Guide

最終更新: 2026-05-16

## 1. このドキュメントの目的

このドキュメントは、Keinage を Self-hosted で使う場合と、公式SaaSとして運用する場合の環境変数、課金、ストレージ、デプロイ時の注意点をまとめます。

- Self-hosted: 課金機能なし、プラン制限なし、ローカルまたはS3互換ストレージで運用します。
- 公式SaaS: Stripe Billing、RDS PostgreSQL、S3、CloudFront、Google OAuth/OIDC、SMTP、監査ログを組み合わせて運用します。

secret、token、Stripe price ID、CloudFront private key、SMTP password は Git にコミットしないでください。ドキュメントや `.env.example` には placeholder のみを記載します。

## 2. モードの全体像

| 用途 | `BILLING_MODE` | `PLAN_ENFORCEMENT_MODE` | 代表的な挙動 |
| --- | --- | --- | --- |
| OSS / Self-hosted 既定 | `disabled` | `unlimited` | 課金導線なし。プラン制限なし。 |
| Self-hosted でローカル制限だけ検証 | `disabled` | `local` | Stripeなしでプラン制限ロジックを検証。 |
| 公式SaaS | `stripe` | `billing` | Stripe subscription と Owner の有効プランを同期し、制限を適用。 |

`BILLING_MODE=disabled` では `/billing` の課金導線は表示されず、`/api/billing/webhook` は 404 を返します。`PLAN_ENFORCEMENT_MODE=unlimited` では、プラン制限を適用しません。

## 3. Self-hosted の既定構成

`.env.example` の既定値は、Self-hosted でそのまま使いやすい構成です。

```bash
BILLING_MODE=disabled
PLAN_ENFORCEMENT_MODE=unlimited
UPLOAD_MAX_BYTES=0
```

`UPLOAD_MAX_BYTES=0` は Self-hosted / unlimited mode の安全上限を無制限として扱います。公式SaaSでは effective plan の `maxUploadBytes` が優先されます。

Self-hosted では、次の設定だけで基本運用を開始できます。

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | 必須 | PostgreSQL 接続文字列。Docker Compose 既定値はローカルDB。 |
| `APP_PUBLIC_ORIGIN` | 推奨 | メールリンク、OAuth callback の基準 origin。ローカルでは `http://localhost:3000`。 |
| `SMTP_*` | 任意 | 登録、招待、PINリセット、重要通知メールに利用。未設定時は該当メール送信をスキップまたは無効化。 |
| `GOOGLE_OAUTH_*` | 任意 | Google アカウント登録・ログインを使う場合に設定。 |
| `WEBAUTHN_*` | 任意 | Owner に Passkey 二要素認証を要求する場合に設定。 |
| `S3_*` / `STORAGE_*` | 任意 | ローカル `uploads/` ではなく S3互換ストレージを使う場合に設定。 |
| `AUDIT_LOG_*` | 任意 | 認証、課金、退会、Super Owner などの監査ログ設定と保持期間。 |
| `WEATHER_PROVIDER` | 任意 | 天気アダプタ。`openweatherapi`（既定）または `tenkiyoho_api_jp`。 |
| `OPENWEATHER_API_KEY` | 任意 | OpenWeather API キーのフォールバック値。代わりに Super Owner が設定画面から登録できます。 |

## 4. 公式SaaS mode

公式SaaSでは、次を設定します。

```bash
KEINAGE_DEPLOYMENT_MODE=official-saas
BILLING_MODE=stripe
PLAN_ENFORCEMENT_MODE=billing
```

公式SaaSでは secret 未設定、弱い設定、課金設定漏れが本番事故につながります。`KEINAGE_DEPLOYMENT_MODE=official-saas` は厳格な起動時チェックの対象になります。

### 4.1 公式SaaS用 env 一覧

| カテゴリ | 変数 | 説明 |
| --- | --- | --- |
| App | `KEINAGE_DEPLOYMENT_MODE` | 公式SaaSでは `official-saas`。 |
| App | `APP_PUBLIC_ORIGIN` | ブラウザで開く正式 origin。例: `https://app.keinage.com`。 |
| DB | `DATABASE_URL` | RDS PostgreSQL などの接続文字列。 |
| Proxy | `TRUST_PROXY_HEADERS` | ALB / CloudFront / Nginx などが全リクエストを通す場合のみ `true`。 |
| Billing | `BILLING_MODE` | 公式SaaSでは `stripe`。 |
| Billing | `PLAN_ENFORCEMENT_MODE` | 公式SaaSでは `billing`。 |
| Stripe | `STRIPE_SECRET_KEY` | Stripe API secret key。 |
| Stripe | `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret。 |
| Stripe | `STRIPE_PRICE_LITE_MONTHLY` / `STRIPE_PRICE_LITE_YEARLY` | Lite の月額 / 年額 price ID。 |
| Stripe | `STRIPE_PRICE_STANDARD_MONTHLY` / `STRIPE_PRICE_STANDARD_YEARLY` | Standard の月額 / 年額 price ID。 |
| Stripe | `STRIPE_PRICE_STANDARD_PLUS_MONTHLY` / `STRIPE_PRICE_STANDARD_PLUS_YEARLY` | Standard+ の月額 / 年額 price ID。 |
| Storage | `S3_REGION` / `S3_BUCKET` | AWS S3 の region と bucket。 |
| Storage | `S3_ENDPOINT` / `S3_INTERNAL_ENDPOINT` | AWS S3 では通常空。S3互換ストレージでは endpoint を指定。 |
| Storage | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | IAM Role を使う本番AWSでは空。ローカル検証やS3互換ではペアで設定。 |
| Storage | `S3_FORCE_PATH_STYLE` | RustFS / MinIO などでは `true`。AWS S3 では通常 `false`。 |
| Storage | `S3_PRESIGNED_UPLOAD_EXPIRES_SECONDS` | ブラウザ直接PUT用の署名URL期限。 |
| Delivery | `STORAGE_DELIVERY_MODE` | private CloudFront 配信では `cloudfront-signed-url`。 |
| Delivery | `STORAGE_PUBLIC_BASE_URL` | ブラウザに返すアプリ側の `/uploads` URL。 |
| Delivery | `STORAGE_CDN_BASE_URL` | CloudFront distribution の base URL。 |
| Delivery | `CLOUDFRONT_KEY_PAIR_ID` / `CLOUDFRONT_PRIVATE_KEY` | CloudFront Signed URL 署名用。 |
| Delivery | `CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS` | Signed URL の有効期限。 |
| Auth | `GOOGLE_OAUTH_ENABLED` | Google OAuth/OIDC を使う場合 `true`。 |
| Auth | `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console の OAuth client。 |
| Auth | `WEBAUTHN_ENABLED` / `WEBAUTHN_OWNER_REQUIRED` | Passkey を使う場合に設定。 |
| Auth | `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN` | WebAuthn relying party 設定。 |
| Mail | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 登録、リセット、重要通知メール。 |
| Contact | `CONTACT_SMTP_*` / `CONTACT_TO_EMAIL` | 問い合わせフォーム用SMTP。未設定時は問い合わせフォームを無効化。 |
| Super Owner | `SUPER_OWNER_EMAIL` / `SUPER_OWNER_BOOTSTRAP_ENABLED` / `SUPER_OWNER_REQUIRE_GOOGLE` | 運営者用高権限ユーザーの初回bootstrap。 |
| Audit | `AUDIT_LOG_ENABLED` / `AUDIT_LOG_IP_HASH_SECRET` / `AUDIT_LOG_RETENTION_DAYS` | 監査ログ、IP hash secret、保持期間。保持日数が正の整数の場合、コンテナ起動時に期限切れログを削除します。未設定または `0` は削除無効です。 |

Stripe price ID は必ず env で管理し、コードや公開ドキュメントに実値を書かないでください。price ID の対応は `src/lib/plans.ts` の `getBillingConfig()` で env から読み取ります。

監査ログ cleanup は `pnpm audit:cleanup` でも実行できます。同じスクリプトを cron や scheduled task から定期実行でき、複数プロセスから同時に呼ばれた場合は PostgreSQL advisory lock により1プロセスだけが削除を実行します。`AUDIT_LOG_ENABLED=false` は新規監査ログのDB保存だけを無効化し、既存ログの保持期間 cleanup は無効化しません。cleanup に失敗した場合は削除対象の内容を出さず、失敗をターミナルへ記録します。コンテナ起動時の cleanup 失敗はサーバー起動を妨げません。

### 4.1 定期保守 cleanup

`pnpm maintenance:cleanup` は dry-run で、期限切れ `auth_sessions`、Google OAuth flow、Owner/Shared signup request、保持期間を過ぎた処理済み Stripe event、期限切れ direct upload session の対象件数を表示します。実際に削除する場合は `pnpm maintenance:cleanup -- --execute` を実行します。

保持期間は `MAINTENANCE_SIGNUP_RETENTION_DAYS`（既定30日）と `STRIPE_EVENT_RETENTION_DAYS`（既定90日）で変更できます。未完了signup requestは期限切れ後に削除し、完了済みrequestは指定保持日数後に削除します。Stripe event は `processed` / `ignored` のみ削除し、`processing` / `failed` は再処理のため保持します。direct upload は署名URL期限後に1時間のcomplete猶予を設け、期限切れsessionに紐づく未登録S3 objectだけを削除します。DB登録済みmediaが存在する場合はobjectを残し、sessionだけを整理します。

`--orphan-media` を付けると、`ORPHAN_MEDIA_MIN_AGE_DAYS`（既定7日）より古く、`media_items` から参照されていないlocal/S3 objectの件数と合計容量を表示します。初期実装では誤削除防止のため、`--execute` と併用してもorphan mediaは削除しません。

Self-hostedでは必要な時だけ手動実行できます。公式SaaSではEventBridge、CronJobなどから同じコマンドを定期実行してください。コンテナ内では `node maintenance-cleanup.cjs`、実削除は `node maintenance-cleanup.cjs --execute` を使用できます。PostgreSQL advisory lockにより同時実行は1プロセスに限定されます。

## 5. 課金単位とOwner scope

Keinage の課金単位は Owner user です。1人の Owner が、ボード、メディア、設定、Shared user を所有します。

- 有料プラン契約は Owner に紐づきます。
- Shared user は課金単位ではありません。
- Shared user を増やしても追加課金対象にはしません。
- ボード数、画像数、ストレージ使用量、動画可否などの制限は Owner scope の使用量で判定します。
- 1つのボードを複数Owner間で共有することはできません。

## 6. プラン制限

| プラン | ボード数 | 画像数 | 総ストレージ | 1ファイル上限 | 最大解像度 | 動画 | スケジュール | 拡張テンプレート | メニュー画像 | 端末状態 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Free | 1 | 3 | 300MB | 5MB | 1920px | 不可 | 不可 | 不可 | 不可 | 不可 |
| Lite | 10 | 無制限 | 5GB | 100MB | 1920px | 可 | 時刻・曜日 | 可 | 不可 | 可 |
| Standard | 100 | 無制限 | 20GB | 500MB | 3840px | 可 | 時刻・曜日・日付 | 可 | 可 | 可 |
| Standard+ | 300 | 無制限 | 100GB | 2GB | 3840px | 可 | 時刻・曜日・日付 | 可 | 可 | 可 |
| Self-hosted / Unlimited | 無制限 | 無制限 | 無制限 | 無制限 | 無制限 | 可 | 時刻・曜日・日付 | 可 | 可 | 可 |

`PLAN_ENFORCEMENT_MODE=unlimited` ではこの表の制限は適用しません。`PLAN_ENFORCEMENT_MODE=billing` では、Owner の Stripe subscription から effective plan を解決し、API と表示 payload の両方で制限を適用します。

ダウングレード予約またはキャンセル予約では、現在の契約期間中は現行プランを維持し、次回更新日で移行先プランの制限を適用します。Keinage は移行先プランに収まる有効ボード候補を自動選択し、Owner は Billing 画面から候補を変更できます。

## 7. ストレージ構成

### 7.1 ローカル保存

S3関連の接続値を空にすると、メディアはローカル `uploads/` に保存されます。Docker Compose では永続化対象の volume / mount を消すとアップロード済みファイルも消えるため、バックアップ対象に含めてください。

### 7.2 AWS S3 + IAM Role

AWS上で運用する場合は、`S3_REGION` と `S3_BUCKET` を設定し、`S3_ENDPOINT` と静的 Access Key / Secret は空のままにします。アプリは AWS SDK の default credential provider chain に任せます。

```bash
S3_REGION=ap-northeast-1
S3_BUCKET=keinage-storage-prod
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PRESIGNED_UPLOAD_EXPIRES_SECONDS=900
```

S3 storage 利用時、動画アップロードはブラウザから S3 へ直接 PUT します。S3 bucket の CORS には、Keinage を開く origin からの `PUT` と `HEAD`、`Content-Type` header、`ETag` exposure を許可してください。

### 7.3 Private S3 + CloudFront Signed URL

S3 bucket を private にしたまま配信する場合は、CloudFront Signed URL 配信を使います。ブラウザには `/uploads/<mediaId>` 形式だけを返し、Keinage が Owner / Board の公開設定を確認してから短時間有効な CloudFront Signed URL へ 302 redirect します。

```bash
STORAGE_DELIVERY_MODE=cloudfront-signed-url
STORAGE_PUBLIC_BASE_URL=https://app.keinage.com/uploads
STORAGE_CDN_BASE_URL=https://storage.keinage.com
CLOUDFRONT_KEY_PAIR_ID=Kxxxxxxxxxxxx
CLOUDFRONT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS=300
```

### 7.4 RustFS / MinIO などのS3互換ストレージ

RustFS / MinIO などでは endpoint、path-style、静的 credentials を設定します。

```bash
S3_INTERNAL_ENDPOINT=http://rustfs:9000
S3_REGION=us-east-1
S3_BUCKET=keinage-media
S3_ACCESS_KEY_ID=rustfsadmin
S3_SECRET_ACCESS_KEY=rustfsadmin
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://localhost:9000/keinage-media
```

Docker Compose 内の app から接続する場合は `S3_INTERNAL_ENDPOINT` を優先します。ブラウザから直接配信する場合は、ブラウザが到達できる `S3_PUBLIC_BASE_URL` を設定してください。

RustFS を使う最短手順:

1. `docker-compose.yml` の `rustfs` サービスコメントを外します。
2. `.env` で `S3_INTERNAL_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_FORCE_PATH_STYLE` を設定します。
3. `docker compose up -d db rustfs app` を実行します。
4. RustFS の Web UI で `keinage-media` バケットを作成します。

## 8. 認証・メール・Super Owner

### 8.1 SMTP

Owner 登録リンク、Shared user 招待リンク、PIN / password reset、重要な会員情報・課金情報変更通知をメール送信する場合は `SMTP_*` を設定します。

```bash
APP_PUBLIC_ORIGIN=https://keinage.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=your-password-here
SMTP_FROM=noreply@example.com
```

SMTP 未設定時、未認証の Owner signup / PIN reset メールフローは既定で無効です。ローカル開発で signup 直リンクのプレビューを使う場合だけ、`ALLOW_UNAUTHENTICATED_SIGNUP_PREVIEW=true` と localhost の `APP_PUBLIC_ORIGIN` を設定します。

### 8.2 Google OAuth/OIDC

Google アカウントによる Owner 登録、Shared user 登録、ログインを有効にする場合は、Google Cloud Console の OAuth クライアントに次の Redirect URI を登録します。

```text
${APP_PUBLIC_ORIGIN}/api/auth/google/callback
```

```bash
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

`APP_PUBLIC_ORIGIN` や Redirect URI に `0.0.0.0` を使わないでください。ローカル開発では `http://localhost:3000` を使います。

### 8.3 Passkey

Owner アカウントに Passkey 二要素認証を追加できます。

```bash
WEBAUTHN_ENABLED=true
WEBAUTHN_OWNER_REQUIRED=true
WEBAUTHN_RP_ID=keinage.example.com
WEBAUTHN_RP_NAME=Keinage
WEBAUTHN_ORIGIN=https://keinage.example.com
```

本番環境では HTTPS が必要です。ローカル開発ではブラウザ仕様により `http://localhost:3000` を利用できます。

### 8.4 Super Owner

Super Owner は公式SaaSや公開インスタンスの運営者向け高権限ユーザーです。デフォルト管理者アカウントや初期パスワードはありません。

```bash
SUPER_OWNER_EMAIL=admin@example.com
SUPER_OWNER_BOOTSTRAP_ENABLED=true
SUPER_OWNER_REQUIRE_GOOGLE=true
```

公式SaaSでは Google OAuth/OIDC を有効化したうえで `SUPER_OWNER_REQUIRE_GOOGLE=true` を推奨します。Super Owner 作成後は `SUPER_OWNER_BOOTSTRAP_ENABLED=false` に戻して構いません。

## 9. Migration / Deployment の注意点

- 本番反映前に `pnpm build` を通してください。
- DB migration は app 起動前に1回だけ実行される構成にしてください。複数appインスタンスが同時に migration を走らせる構成は避けてください。
- Docker entrypoint は起動前に migration を実行します。水平スケールする場合は、migration job と app 起動を分ける運用を検討してください。
- `DATABASE_URL`、Stripe secret、CloudFront private key、SMTP password、Google client secret は secret manager や環境変数で注入し、Git管理しないでください。
- Stripe webhook endpoint は raw body と `STRIPE_WEBHOOK_SECRET` で署名検証します。proxy や middleware で body を改変しないでください。
- Stripe price ID を変更する場合は、Stripe側の price と env の対応を先に更新し、旧subscriptionのWebhook処理が残っても復元できるようにしてください。
- S3 direct upload を使う場合、CORS と bucket policy をデプロイ前に確認してください。
- CloudFront Signed URL を使う場合、S3 bucket の public access block と CloudFront Origin Access Control を併用することを推奨します。
- `TRUST_PROXY_HEADERS=true` は、信頼できる proxy が `x-forwarded-for` などを上書きする構成でのみ有効化してください。
- 監査ログには password、token、secret、Stripe署名、WebAuthn challenge を保存しません。IPアドレスは hash 化されます。

## 10. 関連ドキュメント

- [SPEC.md](./SPEC.ja.md) — ユーザー視点の仕様
- [DESIGN.md](./DESIGN.ja.md) — 内部設計
- [API.md](./API.ja.md) — 画面/API route
- [SECURITY.md](./SECURITY.ja.md) — production / 公式SaaS向けセキュリティ設定
