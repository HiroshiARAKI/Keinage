<p align="center">
  <a href="./DESIGN.md">English</a> | 日本語
</p>

# Keinage Design

最終更新: 2026-05-03

## 1. このドキュメントの目的

このドキュメントは、Keinage のメンテナーおよび開発者向けに、全体設計、技術要素、Database schema、ディレクトリ構成、i18n、主要な実装判断をまとめます。ユーザー視点の仕様は [SPEC.md](./SPEC.ja.md)、ルーティング一覧は [API.md](./API.ja.md) を参照してください。

## 2. 全体アーキテクチャ

Keinage は Next.js App Router を中心に、表示画面、管理画面、Route Handler API を 1 つのアプリで提供します。

```mermaid
flowchart TB
  browser[Browser / Signage Display]
  admin[Dashboard User]
  callUser[Call Screen User]

  subgraph next[Next.js App Router]
    pages[Pages and Layouts]
    routes["Route Handlers /api/*"]
    uploadRoute["/uploads/[...path]"]
    sse[SSE Streams]
  end

  subgraph appLogic[Application Logic]
    auth[Auth and Session]
    oidc[OIDC Provider Foundation]
    media[Media Processing]
    storage[Media Storage Adapter]
    weatherProvider[Weather Provider and Cache]
    templates[Board Template Registry]
    i18n[i18n]
  end

  db[(PostgreSQL)]
  local[(Local uploads/)]
  s3[(S3-compatible Storage)]
  smtp[SMTP]
  google[Google OIDC]
  weather[Weather API]
  github[GitHub Releases API]

  browser --> pages
  admin --> pages
  callUser --> pages
  pages --> routes
  pages --> sse
  routes --> auth
  routes --> oidc
  routes --> media
  routes --> weatherProvider
  routes --> templates
  routes --> i18n
  auth --> db
  templates --> db
  media --> storage
  storage --> local
  storage --> s3
  uploadRoute --> storage
  oidc --> google
  routes --> smtp
  weatherProvider --> weather
  routes --> github
  routes --> db
  sse --> browser
```

## 3. 技術要素

| 項目 | 採用技術 |
| --- | --- |
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| UI | React 19, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Icons | lucide-react |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Media processing | sharp |
| Realtime | Server-Sent Events |
| Auth | App session Cookie, device auth Cookie, PIN, Google OAuth/OIDC, WebAuthn / Passkey |
| OIDC | Discovery, Authorization Code + PKCE, nonce, JWKS RS256 verification |
| Storage | Local filesystem or S3-compatible storage |
| Package manager | pnpm |
| Container | Docker standalone Next.js output |

## 4. ディレクトリ構成

| パス | 役割 |
| --- | --- |
| `src/app` | App Router。画面、Route Handler、アップロード配信 route を配置 |
| `src/app/(board)` | 公開ボード表示 |
| `src/app/(dashboard)` | 認証後の管理画面 |
| `src/app/api` | API Route Handler |
| `src/app/call` | 呼び出し番号テンプレート用の操作画面 |
| `src/app/uploads/[...path]` | ローカル/S3 上のアップロード済みファイルを配信 |
| `src/components/board` | ボード表示、テンプレート、表示用部品 |
| `src/components/dashboard` | 管理画面 UI |
| `src/components/auth` | 認証 UI |
| `src/components/i18n` | クライアント側 i18n provider |
| `src/db` | Drizzle schema と DB 接続 |
| `src/lib` | 認証、OIDC、SSE、メディア、設定、i18n などの共通ロジック |
| `src/types` | 共有型定義 |
| `drizzle` | SQL migration と snapshot |
| `docker` | Dockerfile、entrypoint、migration runner |
| `uploads` | ローカル保存時のメディア実体 |

## 5. Database Schema

### 5.1 ER 図

```mermaid
erDiagram
  users ||--o{ boards : owns
  users ||--o{ users : owns_shared_users
  users ||--o{ auth_accounts : has
  users ||--o{ auth_sessions : has
  users ||--o{ device_auth_grants : has
  users ||--o{ pin_reset_tokens : has
  users ||--o{ super_owner_audit_logs : audits
  users ||--o{ audit_logs : audit_actor
  users ||--o{ admin_announcements : creates
  users ||--o{ announcement_reads : reads
  users ||--o{ settings : owns
  users ||--o{ board_display_devices : monitors
  users ||--o{ shared_signup_requests : invites
  boards ||--o{ media_items : has
  boards ||--o{ messages : has
  boards ||--o{ board_display_devices : displayed_on

  users {
    text id PK
    text user_id UK
    text email UK
    text phone_number UK
    text password_hash
    text pin_hash
    text attribute
    text owner_user_id FK
    text role
    boolean is_super_owner
    text super_owner_granted_at
    text color_theme
    text locale
    text last_full_auth_at
  }

  super_owner_audit_logs {
    text id PK
    text user_id FK
    text action
    text target_type
    text target_id
    text ip_hash
    text user_agent
    text created_at
  }
  audit_logs {
    text id PK
    text actor_user_id FK
    text actor_type
    text action
    text target_type
    text target_id
    text result
    text reason
    text ip_hash
    text user_agent
    text metadata_json
    text created_at
  }

  admin_announcements {
    text id PK
    text title
    text body
    text type
    text severity
    text target_scope
    text publish_status
    text starts_at
    text ends_at
    boolean send_email
    boolean require_acknowledgement
    text created_by FK
    text published_at
  }

  announcement_reads {
    text id PK
    text announcement_id FK
    text user_id FK
    text read_at
    text acknowledged_at
  }

  admin_announcements ||--o{ announcement_reads : read_by

  auth_accounts {
    text id PK
    text user_id FK
    text provider
    text provider_account_id
    text email
  }

  boards {
    text id PK
    text owner_user_id FK
    text name
    text visibility
    text template_id
    text config
    boolean is_active
    text status
    text last_viewed_at
  }

  media_items {
    text id PK
    text board_id FK
    text type
    text file_path
    integer display_order
    integer duration
  }

  messages {
    text id PK
    text board_id FK
    text content
    integer priority
    text kind
    text expires_at
  }

  settings {
    text owner_user_id PK
    text key PK
    text value
  }

  board_display_devices {
    text id PK
    text owner_user_id FK
    text board_id FK
    text device_key
    text user_agent
    text last_seen_at
  }
```

### 5.2 主要テーブル

| テーブル | 役割 |
| --- | --- |
| `users` | ログイン主体。Owner / Shared、ロール、Shared userのプラン適用状態、Super Owner属性、表示設定、PIN、認証時刻を保持 |
| `auth_accounts` | 認証方式と外部アカウントの紐付け。`provider + providerAccountId` が一意 |
| `auth_sessions` | 24 時間のアプリセッション |
| `device_auth_grants` | 端末単位のフル認証履歴。PIN ログイン対象ユーザーを決める |
| `webauthn_credentials` | Owner の Passkey credential public key、counter、transports、最終使用日時 |
| `webauthn_challenges` | WebAuthn 登録・認証 challenge。有効期限と使用済み状態を保持 |
| `audit_logs` | 認証、課金、Webhook、退会、Super Owner操作などの横断監査ログ |
| `super_owner_audit_logs` | Super Owner付与、専用APIアクセス、専用操作の監査ログ |
| `admin_announcements` | Super Ownerが作成する運営通知。種別、重要度、対象プラン、公開期間、メール送信有無を保持 |
| `announcement_reads` | ユーザーごとの運営通知の既読・確認状態 |
| `signup_requests` | Owner のメールアドレス + パスワード仮登録 |
| `shared_signup_requests` | Shared user 招待。招待中・プラン上限による停止・完了・取り消しの状態を保持 |
| `google_oauth_flows` | Google OAuth/OIDC の state、PKCE verifier、nonce、mode、redirectTo |
| `pin_reset_tokens` | PIN リセット用トークン |
| `account_deletion_requests` | Owner アカウント削除用トークン |
| `boards` | ボード本体。テンプレート ID と JSON config を保持 |
| `board_display_devices` | 表示端末 heartbeat。匿名 device key と表示中ボードの組み合わせごとに、User-Agent、最終アクセス時刻を保持 |
| `media_items` | ボードに紐づく画像・動画 |
| `messages` | ボードに紐づくメッセージ |
| `settings` | Owner 単位の KV 設定 |
| `pin_attempts` | 認証失敗回数と各種 rate limit bucket の記録 |

## 6. 認証設計

### 6.1 セッションモデル

```mermaid
sequenceDiagram
  participant U as User
  participant A as Next.js App
  participant DB as PostgreSQL

  U->>A: Full auth (password or Google)
  A->>DB: update users.last_full_auth_at
  A->>DB: upsert device_auth_grants
  A->>DB: insert auth_sessions
  A-->>U: auth-session + device-auth Cookie

  U->>A: PIN login
  A->>DB: read device_auth_grants by device-auth
  A->>DB: verify user pin_hash and full-auth expiry
  A->>DB: insert auth_sessions
  A-->>U: auth-session Cookie
```

Keinage は「フル認証」と「PIN による軽量再認証」を分けています。フル認証はメールアドレス + パスワードまたは Google OAuth/OIDC で行います。PIN ログインは `device-auth` に紐づくユーザーだけを対象にし、フル認証期限が切れていれば拒否します。

`WEBAUTHN_ENABLED=true` かつ `WEBAUTHN_OWNER_REQUIRED=true` の場合、Owner の新規 `auth_sessions` は `webauthn_verified=false` で作成されます。ダッシュボード layout と `getSessionUser()` は未検証セッションをブロックし、Passkey 登録または認証画面だけが `getSessionUserAllowingWebAuthnPending()` で一時的に通過します。

### 6.2 WebAuthn / Passkey

WebAuthn 処理は `src/lib/webauthn.ts` に集約し、RP ID / Origin は `WEBAUTHN_RP_ID`、`WEBAUTHN_ORIGIN`、`APP_PUBLIC_ORIGIN` から解決します。登録・認証の開始 API は challenge を `webauthn_challenges` に保存し、完了 API は client data の challenge と照合して一度だけ消費します。

Owner が Passkey 必須で、credential が未登録の場合は `/passkey/setup`、登録済みの場合は `/passkey/verify` へ誘導します。認証成功後は現在の `auth-session` の `webauthn_verified` を true に更新します。失敗試行は既存の `pin_attempts` bucket を再利用し、24 時間に 5 回までに制限します。

### 6.3 Google OAuth/OIDC

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as Keinage
  participant G as Google OIDC
  participant DB as PostgreSQL

  B->>S: GET /api/auth/google/start
  S->>G: Discovery
  S->>DB: store state, code_verifier, nonce, mode
  S-->>B: redirect to authorization_endpoint
  B->>G: authorize
  G-->>B: redirect /api/auth/google/callback?code&state
  B->>S: callback
  S->>DB: verify state flow
  S->>G: token exchange with PKCE
  S->>G: JWKS fetch and userinfo
  S->>DB: create or lookup user/auth_account
  S-->>B: session cookies and redirect
```

Google は `issuer=https://accounts.google.com` の OIDC Provider preset です。実装は `src/lib/oidc.ts` に集約し、次を provider 非依存にしています。

- Discovery (`/.well-known/openid-configuration`)
- 認可 URL 生成
- Authorization Code + PKCE token exchange
- ID token の issuer / audience / expiration / nonce 検証
- JWKS による RS256 署名検証
- userinfo 取得

Google 固有 route は後方互換のため `src/app/api/auth/google/*` に残します。環境変数名も `GOOGLE_OAUTH_*` を維持します。

### 6.4 Super Owner

Super Owner は公式SaaSの運営通知やメンテナンス通知など、通常Ownerより高い権限を必要とする運営者向けユーザーです。隠しURLや初期パスワードは使わず、通常のOwner登録・ログイン後に環境変数で指定されたメールアドレスと照合して初回bootstrapします。

bootstrap は `SUPER_OWNER_BOOTSTRAP_ENABLED=true`、`SUPER_OWNER_EMAIL` 設定済み、対象ユーザーが検証済みメールアドレスを持つOwner admin、かつ既存Super Ownerが存在しない場合だけ実行されます。`SUPER_OWNER_REQUIRE_GOOGLE=true` の場合は、現在の認証経路が Google OIDC のときだけ付与します。DBには `users.is_super_owner=true` の部分ユニークインデックスを置き、アプリ実装の競合や設定ミスがあっても2人目は作成されません。

Super Owner専用処理は `requireSuperOwner()` を通してサーバー側で必ず確認します。Super Owner付与と専用APIアクセスは `super_owner_audit_logs` に記録し、IPアドレスは直接保存せずハッシュ化します。

Super Owner向けユーザー一覧は `/super-owner/users` と `/api/super-owner/users` で提供します。APIのselect句とレスポンスを許可項目に限定し、認証情報、電話番号、ロック期限などを返しません。Shared userの組織名と実効プランは所属Ownerから解決し、現在ロック中の場合のみ派生statusとして `locked` を返します。

### 6.5 運営通知

Super Owner は `/announcements` から公式SaaSまたはSelf-hosted内の運営通知を作成できます。通知は `draft`、`published`、`archived` の状態を持ち、通常ユーザーには `published` かつ `starts_at` / `ends_at` の公開期間内で、対象プランに一致するものだけを返します。対象プラン判定はクライアントに任せず、サーバー側でユーザーの effective plan から解決します。

未読の `high` / `critical` 通知は管理画面上部にバナー表示します。`require_acknowledgement=true` の通知は、確認済みになるまで管理画面右下にも固定表示します。既読・確認状態は `announcement_reads` に保存します。`send_email=true` の通知は公開時に既存SMTP設定で対象ユーザーへ送信を試行します。メール送信に失敗しても通知公開は取り消さず、失敗件数を通知レコードとSuper Owner監査ログに残します。

### 6.6 監査ログ

`audit_logs` は `src/lib/audit-log.ts` の `writeAuditLog()` / `writeUserAuditLog()` 経由でのみ書き込みます。ログ書き込みに失敗してもユーザー操作は原則止めず、`serverLog()` でターミナルへ構造化エラーを出します。

IPアドレスは生値を保存せず、`AUDIT_LOG_IP_HASH_SECRET` が設定されている場合は HMAC-SHA256、未設定時も固定salt付き SHA-256 でハッシュ化します。`metadata_json` は最小限の情報に留め、password、token、secret、signature、cookie、credential、challenge などのキーはターミナルログとDB保存前に redaction します。

`AUDIT_LOG_ENABLED=false` の場合、DB保存は無効化されますが、重要イベントのターミナルログは維持されます。Super Owner は `/api/super-owner/audit-logs` で直近ログを確認できます。

`docker/cleanup-audit-logs.cjs` は `AUDIT_LOG_RETENTION_DAYS` が正の整数の場合に、指定日数より古い `audit_logs.created_at` を削除します。未設定または `0` では cleanup を無効化します。処理はコンテナ起動時に migration 後へ実行するほか、`pnpm audit:cleanup` を cron / scheduled task から呼び出せます。PostgreSQL advisory lock により同時実行を避け、削除件数と失敗だけをターミナルへ出力します。`AUDIT_LOG_ENABLED=false` でも既存ログの cleanup は継続します。

`docker/maintenance-cleanup.cjs` は長期運用向けの任意実行jobです。既定はdry-runで、`--execute` 指定時だけ期限切れsession/OAuth flow/signup request、保持期間を過ぎた処理済みStripe event、期限切れdirect upload sessionを削除します。direct upload init時に `direct_upload_sessions` へobject keyとcomplete猶予期限を記録し、complete成功時にsessionを消費します。cleanupはDB登録済みmediaのobjectを削除せず、未完了sessionとして追跡されたS3 objectだけを削除します。

orphan mediaは `media_items.file_path` とstorage object一覧を突き合わせますが、初期実装では件数と容量のdry-run報告だけを行います。local uploadsを含め自動削除は行いません。job全体はPostgreSQL advisory lockで多重実行を避けます。

## 7. ボードとテンプレート設計

テンプレートは registry 方式です。`boards.templateId` と `boards.config` で表示を決め、DB schema を増やさずにテンプレート固有設定を JSON として保持します。

```mermaid
flowchart LR
  board[boards row] --> templateId[templateId]
  board --> config[JSON config]
  templateId --> registry[src/lib/templates.ts]
  registry --> component[React template component]
  config --> component
  media[media_items] --> component
  messages[messages] --> component
```

テンプレート追加時は、表示コンポーネント、既定 config、必要な dashboard editor、i18n 文字列、registry 登録を追加します。

標準テンプレートは `simple`、`photo-clock`、`retro`、`message`、`call-number` の5種類です。拡張テンプレートは `clinic-hours`、`restaurant-menu`、`qr-info` で、`PlanLimits.extendedTemplates` によって Free では作成・変更を制限します。`restaurant-menu` の料理画像は `PlanLimits.menuItemImages` と公開ボード payload の `boardPlan.menuItemImages` で表示可否を制御します。

`LiveBoard` は表示領域の高さを基準高さ 1080px に正規化した仮想キャンバスを作り、実画面高との比率でテンプレート全体を `transform: scale()` します。仮想キャンバスの横幅は実表示領域のアスペクト比から算出します。これにより、各テンプレート内の文字、アイコン、画像枠、余白を同じ比率で拡大縮小しつつ、横長・タブレットなどの画面比率には追従します。テンプレートのルート要素は viewport 単位ではなく親キャンバスに対する `width: 100%` / `height: 100%` を使用します。文字サイズ設定値は基準キャンバス上の design point とし、管理画面では `pt` と表示します。

`simple` / `photo-clock` のスケジュール設定は `boards.config` に保持します。主なキーは `mediaSchedules`、`messageSchedules`、`fallbackMediaId` です。表示判定は `src/lib/scheduling.ts` に集約し、表示端末のブラウザが持つローカルタイムゾーンの `Date` で評価します。

`simple` / `photo-clock` のスライドショーは `/api/time` から表示端末とサーバーの時刻差分を推定します。`src/lib/slideshow-sync.ts` が補正済み絶対時刻をメディアの表示秒数タイムラインへ割り当てるため、異なる時刻に開いた端末も同じスライドを選択します。時刻差分は5分ごとに補正します。ランダム再生はボードIDと周回番号から決定的な順序を生成します。動画の再生位置自体は同期しません。

プラン制限は `PlanLimits.scheduling` で表現します。管理 API は保存時に `sanitizeSchedulingConfig` を通し、Free ではスケジュール設定を保存せず、Lite では日付期間を除外します。公開ボード API は `boardPlan.scheduling` を返し、表示コンポーネント側でもプランに応じて判定します。

ボードのプラン適用状態は `boards.status` で管理します。`active` はプラン上有効、`inactive_due_to_plan` はダウングレード適用により表示対象外になった状態です。従来の `is_active` はユーザー操作による表示オン/オフとして残します。表示ページと公開ボード API は、表示成功時に `boards.last_viewed_at` を一定間隔で更新し、ダウングレード予約時の自動候補選択に使います。

Stripe のダウングレード予約またはキャンセル予約を検知した場合、Webhook payload だけで確定せず Stripe API から Subscription / Subscription Schedule を再取得します。`owner_subscriptions.current_price_id`、`current_period_end`、`cancel_at`、`stripe_schedule_id`、`pending_plan_code`、`pending_price_id`、`pending_billing_interval`、`pending_plan_effective_at`、`pending_active_board_ids` を保存します。`pending_active_board_ids` は `last_viewed_at`、`updated_at`、`created_at` の降順で、移行先プランの `PlanLimits.boards` 件まで自動生成します。実際の切替時は pending 候補だけを `active` とし、それ以外を `inactive_due_to_plan` にします。pending 候補が空または不正な場合も同じ順序で再選択します。

ダウングレード影響の表示は `src/lib/plan-impact.ts` に集約します。`OwnerUsage` と対象 `PlanDefinition` を比較し、ボード数、画像数、ストレージ、動画可否、動画解像度、1ファイル上限の超過候補を `PlanImpact` として返します。Billing 画面は予約中プランの影響警告、現在プランの over-limit 解消案内、プラン比較カードの事前警告に同じ判定を使います。

Shared user上限は `PlanLimits.sharedUsers` と `src/lib/shared-user-plan.ts` に集約します。有効な Shared user と期限内で `invited` の招待をカウントし、招待作成・招待完了・再有効化時にサーバー側で検証します。Stripe webhookでプラン変更が実適用された時は、既存の有効ユーザーを優先して上限内を `active`、超過分を `inactive_due_to_plan` に変更し、超過ユーザーのセッションを削除します。`PLAN_ENFORCEMENT_MODE=unlimited` では上限は `null` となり、停止済みユーザーと招待を再度有効化します。

## 8. メディア保存と配信

`src/lib/media-storage.ts` がローカル保存と S3 互換ストレージを抽象化します。

`media_items.file_size_bytes` と `thumbnail_size_bytes` は Owner のストレージ使用量計算に使います。`media_items.width` / `height` はアップロード時に取得した画像・動画寸法で、`media_items.video_duration_seconds` は動画ファイルの長さを秒単位で保持します。既存メディアは自動削除・自動リサイズせず、現在プランの `storageBytes`、`images`、`videoEnabled`、`maxResolution`、対象テンプレートのボード単位メディア上限を超える場合は、新規アップロード、テンプレート変更、設定保存、表示時の動画再生を制限します。

```mermaid
flowchart TB
  upload[POST /api/media] --> validate[Validate file]
  validate --> image[Image resize / thumbnail]
  image --> adapter[media-storage adapter]
  adapter --> local[uploads/]
  adapter --> s3[S3-compatible bucket]
  adapter --> db[(media_items)]
  request[GET /uploads/... ] --> adapter
  adapter --> response[Media response]
```

- DB には `/uploads/<filename>` の公開パスを保存します。
- 新規アップロードの object key は `owners/<owner>/boards/<board>/media/<mediaId>.<ext>` とし、Owner / board scope を key に含めます。サムネイルは同じ scope の `media/thumbs/` に保存します。既存の flat key も引き続き読み出せます。
- S3 未設定時は `uploads/` に保存します。S3 利用時は `S3_REGION` と `S3_BUCKET` が必須です。`S3_INTERNAL_ENDPOINT` / `S3_ENDPOINT` は任意で、AWS S3 では省略できます。`S3_ACCESS_KEY_ID` と `S3_SECRET_ACCESS_KEY` は両方ある場合のみ明示 credentials として使い、空の場合は AWS SDK の default credential provider chain に任せます。
- `STORAGE_DELIVERY_MODE=cloudfront-signed-url` の場合、board に返す media URL は `/uploads/<mediaId>` 形式にし、`/uploads/[...path]` route で board の公開設定と Owner scope を確認してから CloudFront Signed URL へ 302 redirect します。署名生成には `STORAGE_CDN_BASE_URL`、`CLOUDFRONT_KEY_PAIR_ID`、`CLOUDFRONT_PRIVATE_KEY` を使い、有効期限は `CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS` で調整できます。
- 署名付き配信を使わない場合は、`S3_PUBLIC_BASE_URL`、`STORAGE_PUBLIC_BASE_URL`、`CLOUDFRONT_BASE_URL` の順で公開 base URL を参照し、設定されている場合は public board の media URL に使います。private board は `/uploads/[...path]` route を維持し、認可と `private, no-store` cache-control を適用します。
- 画像は `src/lib/image.ts` でリサイズとサムネイル生成を行います。
- standalone build 後の動的ファイル配信に対応するため、`/uploads/[...path]` route で保存先から読み出します。動画のシークと終端ループを安定させるため、ローカル保存と S3 保存のどちらでも `Range` リクエストへ `206 Partial Content` で応答します。

## 9. リアルタイム更新

Keinage は WebSocket ではなく Server-Sent Events を使います。

```mermaid
flowchart LR
  mutation["API mutation"] --> emit["emitSSE(boardId, event)"]
  emit --> hub["src/lib/sse.ts in-memory clients"]
  hub --> display["Board display"]
  display --> refetch["Refetch board/media/messages or weather"]
```

SSE はプロセス内メモリで購読者を管理します。複数アプリインスタンス間のイベント共有は未対応です。

## 10. 天気プロバイダ

`src/lib/weather/types.ts` でプロバイダ非依存の予報モデルとプロバイダI/Fを定義します。外部API固有のレスポンス解析は `src/lib/weather/providers/` 以下へ閉じ込めます。既定の `openweatherapi` アダプタは OpenWeather One Call API 4.0 の Current と1時間 Timelineを利用し、同梱都市リストで保存済み City ID を緯度経度へ解決して、天気状態、摂氏気温、時間別 `pop` を共通モデルへ変換します。日本向けには `tenkiyoho_api_jp` も選択できます。

`src/lib/weather/service.ts` はプロバイダ・観測地単位で予報を更新します（OpenWeatherは1時間、日本向けプロバイダは30分）。同じ予報日では各更新の非null値を日次キャッシュへマージし、後続レスポンスから最高気温や経過済み時間帯の降水確率が欠落しても、取得済みの値を消しません。予報日が変わった場合は新しい日次キャッシュへ切り替えます。更新中の重複リクエストには直ちにstaleキャッシュを返し、更新失敗時も取得済みデータを保持します。`/api/weather` はボード認可とOwner設定の観測地解決を担当し、外部アクセスはすべてこのサービスへ委譲します。

画面はプロバイダ提供の天気画像を直接描画しません。`WeatherDisplay` が共通の天気状態コードをKeinage専用のモノクロSVGへ変換するため、今後プロバイダを追加・変更しても同じUIを維持できます。利用するアダプタは `WEATHER_PROVIDER` で選択し、未対応値は明示的にエラーとします。

## 11. i18n

| ファイル | 役割 |
| --- | --- |
| `src/lib/i18n.ts` | 対応 locale、fallback、format helper |
| `src/lib/i18n/messages/*.ts` | locale ごとの UI 文字列 catalog |
| `src/lib/i18n/messages/index.ts` | locale catalog の集約 / 型公開 |
| `src/lib/i18n-messages.ts` | 互換 re-export |
| `src/lib/i18n-server.ts` | Server Component / Route Handler 側の request locale 解決 |
| `src/components/i18n/LocaleProvider.tsx` | Client Component 側の locale context |

Locale はユーザー設定、Cookie、`Accept-Language` の順に解決します。新しい表示文字列を追加する場合は、`src/lib/i18n/messages/en-US.ts` を基準に各 locale ファイルへ同じ key を追加します。各翻訳は `satisfies Record<MessageKey, string>` で翻訳漏れを型検出します。

## 12. 設定管理

設定は大きく 2 種類です。

| 種類 | 保存先 | 例 |
| --- | --- | --- |
| ユーザー設定 | `users` | `colorTheme`, `locale`, userId, email, PIN |
| Owner 設定 | `settings` | `weatherCityId`, `imageMaxLongEdge`, `authExpireDays` |

Owner 設定は KV 形式のため、DB migration を増やさずに設定項目を追加できます。型変換や既定値は `src/lib/owner-settings.ts` と各 Route Handler / UI で扱います。

## 13. 外部連携

| 連携先 | 用途 |
| --- | --- |
| Google OIDC | Google アカウントによる登録・ログイン |
| SMTP | 登録、招待、PIN リセット、アカウント削除 URL の送信 |
| OpenWeather（既定 `openweatherapi`） | 現在の天気、時間別降水確率、City IDデータ |
| 天気予報 API（`tenkiyoho_api_jp`） | 任意の日本向け天気アダプタ |
| GitHub Releases API | 最新バージョン確認 |
| S3-compatible storage | メディア保存 |

## 14. Docker / デプロイ

Docker は multi-stage build です。

1. `deps`: pnpm 依存関係をインストール
2. `builder`: `pnpm build`
3. `runner`: standalone output と静的ファイルを実行

`docker/entrypoint.sh` は起動前に migration を実行してから `node server.js` を起動します。Docker Compose では PostgreSQL health check 後に app が起動します。

## 15. 開発時の注意

- Route Handler の認可境界は endpoint ごとに確認してください。
- 新しい UI 文字列は i18n catalog に追加してください。
- 新しいテンプレート設定は `boards.config` の後方互換を意識してください。
- OAuth redirect で `0.0.0.0` を使わず、ローカルでは `http://localhost:3000` を使ってください。
- SSE は単一プロセス前提です。水平スケール時は共有 pub/sub が必要です。
