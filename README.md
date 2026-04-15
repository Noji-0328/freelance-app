# FL Manager - フリーランス管理ツール

フリーランサー向けの軽量Webアプリ。タスクボード・クライアント管理・請求書PDF生成をSupabaseで一元管理します。

## 機能一覧

| 機能 | 概要 |
|------|------|
| タスクボード | Trello風カンバン（未着手/進行中/完了）、期限切れバッジ表示 |
| クライアント管理 | 会社名・担当者・住所・電話・メール・メモの登録/編集/削除 |
| 請求書PDF | クライアント＋対象月で完了タスクを自動集計してPDF出力 |
| 自分の情報 | 氏名/屋号・住所・連絡先・振込先の管理 |
| バックアップ/リストア | 全データをJSONでダウンロード・復元 |
| 期限アラート | 起動時に期限3日以内のタスクをバナー表示 |
| Push通知 | ブラウザ通知（許可した場合） |

## 技術スタック

- **フロントエンド**: Vite + Vanilla JS
- **バックエンド/DB**: Supabase（無料枠）
- **PDF生成**: jsPDF + jsPDF-AutoTable
- **ホスティング**: Vercel / GitHub Pages

---

## セットアップ手順

### 1. Supabase プロジェクト作成

1. [https://supabase.com](https://supabase.com) にアクセスしてアカウントを作成（無料）
2. 「New Project」をクリックしてプロジェクトを作成
   - Project name: 任意（例: `freelance-app`）
   - Database Password: 安全なパスワードを設定
   - Region: `Northeast Asia (Tokyo)` を推奨
3. プロジェクト作成後、左サイドバーの「Settings」→「API」を開く
4. 以下の値をメモする：
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` で始まる長い文字列

### 2. データベーステーブルの作成

1. Supabase の左サイドバーから「SQL Editor」を開く
2. 「New query」をクリック
3. プロジェクトルートの `schema.sql` の内容をすべてコピーして貼り付ける
4. 「RUN」ボタンを押して実行

テーブルが正しく作成されたか確認するには、左サイドバーの「Table Editor」で `clients`・`tasks`・`my_info` が表示されていることを確認します。

### 3. ローカル開発環境のセットアップ

```bash
# リポジトリのクローン
git clone https://github.com/KameVer/freelance-app.git
cd freelance-app

# 依存パッケージのインストール
npm install

# 環境変数ファイルの作成
cp .env.example .env
```

`.env` を開き、手順1でメモした値を入力します：

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...（anon public key）
```

```bash
# 開発サーバー起動
npm run dev
```

ブラウザで `http://localhost:5173` を開いて動作確認します。

---

## デプロイ

**Vercel（デプロイ済み）**: https://freelance-app.vercel.app/
- GitHub リポジトリと連携済み。`main` ブランチへの push で自動デプロイ
- Vercel ダッシュボード「Settings」→「Environment Variables」で `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定

## GitHub Pages へのデプロイ

GitHub Pages は静的ファイルをホスティングするため、Supabase の接続情報を**ビルド時に埋め込む**必要があります。`.env` ファイルはGitにコミットしないため、以下の方法で対応します。

### 方法A: GitHub Actions の Secrets を使う（推奨）

1. GitHub リポジトリの「Settings」→「Secrets and variables」→「Actions」を開く
2. 「New repository secret」で以下を追加：
   - `VITE_SUPABASE_URL`: SupabaseのProject URL
   - `VITE_SUPABASE_ANON_KEY`: Supabaseのanon public key
3. `.github/workflows/deploy.yml` を作成（下記参照）
4. `main` ブランチにpushするたびに自動デプロイされます

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### 方法B: gh-pages コマンドを使う（ローカルでビルド）

`.env` に正しい値を設定した状態でローカルからデプロイします：

```bash
npm run deploy
```

> **注意**: `vite.config.js` の `base` が `/freelance-app/` になっていることを確認してください。リポジトリ名が異なる場合は変更が必要です。

### 方法C: ソースコードに直接書き込む（最もシンプル、セキュリティ注意）

**個人利用かつ公開リポジトリでも問題ない場合のみ。**

`src/supabase.js` を以下のように書き換えます：

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xxxxxxxxxxxx.supabase.co'  // 実際のURLに変更
const supabaseAnonKey = 'eyJhbGci...'                   // 実際のキーに変更

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

その後ビルドしてdeployします：

```bash
npm run build
npm run deploy
```

---

## Supabase の RLS（Row Level Security）について

現在 RLS は無効（コメントアウト）になっています。

**セキュリティリスク**: anon key が分かれば誰でもデータにアクセスできます。

個人利用のみであれば問題ありませんが、将来的に認証を追加する場合は `schema.sql` の RLS 設定を有効化してください。

---

## フォルダ構成

```
freelance-app/
├── index.html          # メインHTML
├── vite.config.js      # Vite設定
├── package.json
├── schema.sql          # Supabase テーブル定義
├── .env.example        # 環境変数のサンプル
├── .env                # 環境変数（Gitに含めない）
└── src/
    ├── main.js         # メインロジック
    ├── invoice.js      # 請求書PDF生成
    └── style.css       # スタイル
```

---

## PDF の日本語について

PDF生成時、起動時に Google Fonts から Noto Sans JP フォントの取得を試みます。

- **成功した場合**: 日本語テキストが正しく表示されます
- **失敗した場合（CORS等）**: テーブルヘッダー等は英語表記にフォールバックします。タスク名・クライアント名など日本語テキストは文字化けする場合があります

CORS の問題が発生する場合は、事前にフォントをダウンロードしてローカルに配置するか、タスク名を英語で入力することを推奨します。

---

## ライセンス

MIT
