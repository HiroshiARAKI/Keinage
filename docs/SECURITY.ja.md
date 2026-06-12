<p align="center">
  <a href="./SECURITY.md">English</a> | 日本語
</p>

# Security Hardening

このメモは公式 SaaS 運用と production self-hosted 運用で確認すべきセキュリティ設定をまとめます。

## 公式 SaaS モード

`NODE_ENV=production` かつ `KEINAGE_DEPLOYMENT_MODE=official-saas` または `KEINAGE_OFFICIAL_SAAS=true` の場合、起動時に production security config を検証します。不足がある場合は起動に失敗します。

必須項目:

- `APP_PUBLIC_ORIGIN` は `https://` の公開 origin
- `TRUST_PROXY_HEADERS=true`
- `BILLING_MODE=stripe`
- `PLAN_ENFORCEMENT_MODE=billing`
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、全 Stripe price ID
- `GOOGLE_OAUTH_ENABLED=true`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`
- `SUPER_OWNER_REQUIRE_GOOGLE=true`
- `S3_REGION`、`S3_BUCKET`
- `STORAGE_DELIVERY_MODE=cloudfront-signed-url`
- `STORAGE_CDN_BASE_URL`、`CLOUDFRONT_KEY_PAIR_ID`、`CLOUDFRONT_PRIVATE_KEY`

Self-hosted ではこのモードを設定しなければ強制 fail にはなりません。ただし production で `APP_PUBLIC_ORIGIN` が HTTPS でない場合は warning を出します。

## Rate Limit

認証・登録・問い合わせ・課金・アップロードの入口に rate limit を適用します。IP の解決は `TRUST_PROXY_HEADERS=true` のときだけ `x-forwarded-for` / `x-real-ip` を信頼し、それ以外は direct bucket に集約します。

対象:

- Credentials login / PIN login
- Owner signup / signup resend / Google OAuth start
- Contact form
- Billing checkout / portal
- Server upload / S3 direct upload init / complete

## Security Headers

全 route に以下を付与します。

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Cross-Origin-Opener-Policy: same-origin`
- production のみ `Strict-Transport-Security`

CSP は S3 presigned upload、CloudFront、Google Fonts など導入先ごとの allowlist 調整が必要なため、現時点では固定ヘッダとしては設定していません。天気アイコンはアプリ内のinline SVGであり、外部画像originは不要です。公式 SaaS では CDN / WAF 側で `connect-src` に S3 / CloudFront / app origin を含めた CSP を運用してください。

## Upload Validation

アップロードは Content-Type と拡張子の両方を検証します。対応形式は JPEG / PNG / WebP / GIF / MP4 / WebM です。S3 direct upload でも署名発行前と完了登録前に同じ検証を行い、完了時は `HeadObject` でサイズと Content-Type を確認します。

Private board の media は `/uploads/[...path]` で Owner scope を確認します。raw storage key route でもDB上の `media_items` 参照がないオブジェクトは 404 とし、退会後の削除失敗ファイルや S3 direct upload の未完了オブジェクトをアプリ経由で配信しません。CloudFront signed URL delivery ではアプリ側で認可後に短時間有効な signed URL へ redirect します。

## Secret Logging

Stripe webhook secret、Stripe API secret、OIDC client secret、authorization code、access token、ID token、raw webhook body はログ出力しません。OIDC の discovery / JWKS / token exchange failure は HTTP status のみログに残します。

## AWS Least Privilege Notes

公式 SaaS では ECS / App Runner / EC2 などの実行ロールに最小権限を付与してください。

S3 media bucket:

- `s3:PutObject`
- `s3:GetObject`
- `s3:HeadObject`
- `s3:DeleteObject`
- `s3:ListBucket`

対象 resource は media bucket と `owners/*` prefix に絞ることを推奨します。静的 access key は使わず、AWS SDK default credential provider chain と IAM role を使います。

CloudFront:

- Signed URL の private key は環境変数または secrets manager から注入します。
- S3 bucket は public access block を有効にし、CloudFront Origin Access Control からのみ読める構成を推奨します。

RDS PostgreSQL:

- アプリ用 DB user は Keinage DB schema への必要権限に限定します。
- public internet へ直接公開せず、アプリ実行環境からの private network 接続に限定します。

Secrets:

- Stripe / Google / SMTP / CloudFront private key は Git 管理しません。
- CI/CD と runtime では secrets manager またはホスティング基盤の secret store から注入してください。
