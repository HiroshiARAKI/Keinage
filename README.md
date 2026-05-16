# Keinage

<p align="center">
<img src="./screenshots/keinage.png" width="400">
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

### シンプルな電子掲示板

![Simple Board](./screenshots/keinage-simple-guide.png)

画像や動画のスライドショーとテキストティッカーを表示します。

### フォトクロック掲示板

![Clock Board](./screenshots/keinage-photoclock.png)

写真スライドショーに現在日時を重ねて表示します。

### レトロな掲示板

![Retro Board](./screenshots/keinage-retro.png)

駅の案内板を模したドットマトリクス風の表示です。

### 呼び出し番号

![Message Board](./screenshots/keinage-ordercall.png)

スマホなどから番号を追加し、表示画面へ呼び出し番号を出せます。

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
| [docs/SPEC.md](docs/SPEC.md) | ユーザー視点の機能仕様、テンプレート、プラン別機能 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Self-hosted / 公式SaaSの環境変数、課金、ストレージ、デプロイ注意点 |
| [docs/DESIGN.md](docs/DESIGN.md) | メンテナー向け設計、DB schema、実装構造 |
| [docs/API.md](docs/API.md) | 画面ルート、API Route Handler、SSE、アップロード配信 route |
| [docs/SECURITY.md](docs/SECURITY.md) | production / 公式SaaS向けセキュリティ設定 |
| [docs/TRADEMARK.md](docs/TRADEMARK.md) | Keinage の名称、ロゴ、ブランド利用ルール |

## よく使う設定の入口

- メール送信: `APP_PUBLIC_ORIGIN` と `SMTP_*` を設定します。
- Google OAuth/OIDC: `GOOGLE_OAUTH_ENABLED=true` と `GOOGLE_OAUTH_*` を設定します。
- Passkey: `WEBAUTHN_ENABLED=true` と `WEBAUTHN_*` を設定します。
- S3 / CloudFront: `S3_*` と `STORAGE_*` を設定します。
- Stripe Billing: `BILLING_MODE=stripe`、`PLAN_ENFORCEMENT_MODE=billing`、`STRIPE_*` を設定します。
- Super Owner: `SUPER_OWNER_*` を設定します。
- 監査ログ: `AUDIT_LOG_*` を設定します。

詳細な設定例と注意点は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

## コントリビューション

Issue や Pull Request は歓迎します。バグ報告や機能リクエストは GitHub Issues よりお願いいたします。

## 謝辞

- 天気予報データは [天気予報 API（livedoor 天気互換）](https://weather.tsukumijima.net/) を利用させていただいています。

## ライセンス

このプロジェクトは [Apache License 2.0](LICENSE) の下でライセンスされています。個人利用、社内利用、商用利用、オンプレミス環境でのセルフホスト利用は、Apache License 2.0 の条件に従って自由に行えます。

ただし、Keinage の名称、ロゴ、公式サービスと誤認されるブランド表現は Apache License 2.0 の許諾対象ではありません。

詳しくは [LICENSE](LICENSE)、[NOTICE](NOTICE)、[docs/TRADEMARK.md](docs/TRADEMARK.md) を参照してください。
