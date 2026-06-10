<p align="center">
  <a href="./README.md">English</a> | 日本語
</p>

# Keinage

<p align="center">
<img src="./doc-res/keinage.png" width="400">
</p>
<p align="center">
<a href="https://keinage.com">keinage.com</a>
</p>
<p align="center">
Web上で簡単にカスタマイズできる掲示板、案内板、デジタルサイネージ
</p>

Keinage は、管理画面で作成したボードを表示端末へリアルタイム反映する OSS のデジタルサイネージ Web アプリです。病院の待合室、店舗、飲食店、オフィス、イベント会場などで、画像、動画、メッセージ、時計、天気、呼び出し番号を表示できます。

## 主な特徴

- **テンプレートベース**: 用途に合わせて掲示板、フォトクロック、呼び出し番号、診療時間、メニューなどを選択できます。
- **リアルタイム更新**: 管理画面や API からの変更が SSE で表示画面へ反映されます。
- **Owner / Shared user**: Owner のワークスペースに Shared user を招待して共同編集できます。
- **Self-hosted friendly**: 既定では課金なし、プラン制限なし、ローカル保存で使えます。
- **公式SaaS対応の基盤**: Stripe Billing、S3 / CloudFront、Google OAuth/OIDC、監査ログ、Super Owner を設定できます。

## テンプレート例
![keinage template usages](doc-res/keinage-usages.png)

## 技術スタック

| カテゴリ | 技術 |
| --- | --- |
| 言語 | TypeScript |
| フレームワーク | Next.js 16 (App Router) |
| UI | Tailwind CSS v4, shadcn/ui, Framer Motion |
| DB | PostgreSQL, Drizzle ORM |
| リアルタイム通信 | Server-Sent Events (SSE) |
| 認証 | Email + password, Google OAuth/OIDC, PIN, WebAuthn / Passkey |
| ストレージ | Local filesystem, S3-compatible storage |
| コンテナ | Docker, Docker Compose |

## クイックスタート

### 必要環境

- Node.js 20 以上
- pnpm 9 以上
- Docker / Docker Compose

### Docker Compose で起動

```bash
git clone https://github.com/HiroshiARAKI/Keinage.git
cd Keinage
cp .env.example .env
docker compose up -d
```

ブラウザで `http://localhost:3000` を開き、初回は Owner 管理者アカウントを登録してください。登録後に 6 桁 PIN を設定すると管理画面へ入れます。

停止する場合:

```bash
docker compose down
```

DB やアップロードファイルを含む Docker ボリュームも削除する場合:

```bash
docker compose down -v
```

## 既定のSelf-hostedモード

`.env.example` の既定値では、OSS / Self-hosted 利用者が課金機能なしで従来通り使える構成です。

```bash
BILLING_MODE=disabled
PLAN_ENFORCEMENT_MODE=unlimited
UPLOAD_MAX_BYTES=0
```

この状態では `/billing` の課金導線は表示されず、プラン制限も適用されません。メディア保存先はローカル `uploads/` です。S3互換ストレージ、RustFS / MinIO、公式SaaS向けのStripe設定は必要になった時だけ追加してください。

## 詳細ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [docs/SPEC.ja.md](docs/SPEC.ja.md) | ユーザー視点の機能仕様、テンプレート、プラン別機能 |
| [docs/DEPLOYMENT.ja.md](docs/DEPLOYMENT.ja.md) | Self-hosted / 公式SaaSの環境変数、課金、ストレージ、デプロイ注意点 |
| [docs/DESIGN.ja.md](docs/DESIGN.ja.md) | メンテナー向け設計、DB schema、実装構造 |
| [docs/API.ja.md](docs/API.ja.md) | 画面ルート、API Route Handler、SSE、アップロード配信 route |
| [docs/SECURITY.ja.md](docs/SECURITY.ja.md) | production / 公式SaaS向けセキュリティ設定 |
| [docs/TRADEMARK.ja.md](docs/TRADEMARK.ja.md) | Keinage の名称、ロゴ、ブランド利用ルール |

## よく使う設定の入口

- メール送信: `APP_PUBLIC_ORIGIN` と `SMTP_*` を設定します。
- Google OAuth/OIDC: `GOOGLE_OAUTH_ENABLED=true` と `GOOGLE_OAUTH_*` を設定します。
- Passkey: `WEBAUTHN_ENABLED=true` と `WEBAUTHN_*` を設定します。
- S3 / CloudFront: `S3_*` と `STORAGE_*` を設定します。
- Stripe Billing: `BILLING_MODE=stripe`、`PLAN_ENFORCEMENT_MODE=billing`、`STRIPE_*` を設定します。
- Super Owner: `SUPER_OWNER_*` を設定します。
- 監査ログ: `AUDIT_LOG_*` を設定します。`AUDIT_LOG_RETENTION_DAYS` が正の整数の場合、コンテナ起動時に指定日数より古いログを削除します。手動・定期実行では `pnpm audit:cleanup` を使用できます。
- 定期保守: `pnpm maintenance:cleanup` で dry-run、`pnpm maintenance:cleanup -- --execute` で期限切れセッション、OAuth/signup flow、Stripe event、未完了direct uploadを削除します。`--orphan-media` は未参照メディア候補を削除せず集計します。

詳細な設定例と注意点は [docs/DEPLOYMENT.ja.md](docs/DEPLOYMENT.ja.md) を参照してください。

## コントリビューション

Issue や Pull Request は歓迎します。バグ報告や機能リクエストは GitHub Issues よりお願いいたします。

## 謝辞

- 天気予報データは [天気予報 API（livedoor 天気互換）](https://weather.tsukumijima.net/) を利用させていただいています。

## ライセンス

このプロジェクトは [Apache License 2.0](LICENSE) の下でライセンスされています。個人利用、社内利用、商用利用、オンプレミス環境でのセルフホスト利用は、Apache License 2.0 の条件に従って自由に行えます。

ただし、Keinage の名称、ロゴ、公式サービスと誤認されるブランド表現は Apache License 2.0 の許諾対象ではありません。

詳しくは [LICENSE](LICENSE)、[NOTICE](NOTICE)、[docs/TRADEMARK.ja.md](docs/TRADEMARK.ja.md) を参照してください。
