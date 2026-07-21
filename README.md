# タニメモ

自分専用のメモPWAです。オフラインで速く読み書きでき、iPhoneとPCの間で同期します。NotionとiPhoneメモ帳の置き換えとして作りました。

1人につき1インスタンスを自分のCloudflareアカウントに立てて使います（無料枠で動きます）。

## 特徴

- **ローカルファースト**: メモは端末内（IndexedDB）に保持。起動・検索・編集はオフラインで動き、同期は裏で走る
- **2端末同期**: Cloudflare Workers + D1 + R2 との差分同期。競合は更新時刻の新しい方を採用（last-write-wins）。削除はゴミ箱方式（30日は復元可能、期限後に完全消去）
- **Markdownベース**: 先頭行がタイトル。チェックボックス（`- [ ]`）は閲覧画面でタップ切替
- **整理**: 入れ子フォルダ、ドラッグ＆ドロップでの移動・手動並べ替え、重要度（星0〜3、星3は一覧上部に固定）、本文検索
- **画像**: 複数添付、サムネイル表示、原寸表示はピンチズーム・パン対応、PCではデスクトップへドラッグアウトで保存
- **受け渡し**: iPhoneの共有シートから送信（iOSショートカット）、PCはCtrl+Vで貼り付け（テキスト・URL・画像）
- **エクスポート**: 全メモをMarkdown＋画像のzipで一括ダウンロード
- **操作感**: グローバルundo/redo、右フリックで戻る（iOS風）、スワイプ削除

## 構成

```
app/     フロントエンド: Vite + React + TypeScript + Dexie(IndexedDB) + PWA(自動更新)
worker/  バックエンド:   Cloudflare Workers + D1(メモ・メタデータ) + R2(画像実体)
docs/    iPhoneセットアップ手順など
```

認証は長いランダムトークン1本のBearer認証です。ログイン機能・マルチユーザー機能はありません（トークンを知っている人は全メモを読み書きできます）。

## 自分用に立てる（セルフホスト）

前提: Node.js 20以上、Cloudflareアカウント（無料プランで可）

```bash
# 1. 取得と依存インストール
git clone https://github.com/tany4417-png/tanimemo.git
cd tanimemo/app && npm install
cd ../worker && npm install

# 2. Cloudflareにログイン（worker/ で実行）
npx wrangler login

# 3. D1（データベース）とR2（画像置き場）を作る
npx wrangler d1 create tanimemo
#    → 表示された database_id を worker/wrangler.jsonc の database_id に書き換える
npx wrangler r2 bucket create tanimemo-att

# 4. スキーマを適用
npx wrangler d1 migrations apply tanimemo --remote

# 5. APIトークンを設定（長いランダム文字列を貼り付ける）
#    生成例 mac/Linux: openssl rand -base64 33
#    生成例 PowerShell: -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 44 | % {[char]$_})
npx wrangler secret put API_TOKEN

# 6. ビルドしてデプロイ
cd ../app && npm run build
cd ../worker && npx wrangler deploy
#    → https://tanimemo.<あなたのサブドメイン>.workers.dev が表示される
```

端末側のセットアップ:

1. 表示されたURLをブラウザで開き、設定画面にAPIトークンを貼り付けて保存する
2. スマホは「ホーム画面に追加」でPWAとしてインストールする
3. iPhoneの共有シートから送れるようにする手順は [docs/ios-shortcut-setup.md](docs/ios-shortcut-setup.md)

## 開発

```bash
# フロント開発サーバー（http://localhost:5173、/api は 8787 へproxy）
cd app && npm run dev

# ローカルWorker（http://127.0.0.1:8787）。トークンは worker/.dev.vars に API_TOKEN=好きな値 を書く
cd worker && npx wrangler dev

# テスト（それぞれのディレクトリで）
npm test
```

デプロイは「app をビルド → worker で `npx wrangler deploy`」の順です。D1のスキーマを変えたときは先に `npx wrangler d1 migrations apply tanimemo --remote` を実行します。トークンを変えるときは `npx wrangler secret put API_TOKEN`（変更後は各端末の設定画面とショートカットも更新）。

## バックアップ

アプリの設定 → 「全メモをエクスポート」で、Markdownファイル＋画像一式のzipがダウンロードできます。データを人質に取られないための保険です。

## 注意

- 1人用の設計です。APIトークンは厳重に管理してください
- 個人のメモ量ならCloudflare無料枠（Workers 10万リクエスト/日、D1 5GB、R2 10GB）で大幅に余裕があります
- 無保証です。大事なデータはエクスポートでバックアップしてください

## ライセンス

[MIT](LICENSE)
