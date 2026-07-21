# タニメモ

自分専用のメモPWAです。オフラインで速く読み書きでき、iPhoneとPCの間で同期します。NotionとiPhoneメモ帳の置き換えとして作りました。

> **はじめての方へ**: このページ上でアプリが動くわけではありません。ここにあるのは設計図と説明書です。タニメモは「使う人が自分のCloudflareアカウント（無料）に、自分専用のコピーを1つ作る」方式で、下の手順どおりに進めると**あなた専用のURL**ができて、スマホとPCから使えるようになります。所要30分〜1時間、費用は0円です。

使えるようになるまでの全体像:

1. PCに道具を2つ入れる（Node.js と Git）
2. Cloudflareの無料アカウントを作る
3. この設計図を手元にコピーする
4. コマンドを順番に貼り付けて実行する（コピペで進められます）
5. 最後に表示される自分専用URLをスマホ・PCで開いて設定する

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

### 手順0: 道具を入れる（最初の1回だけ）

- **Node.js**（LTS版）: https://nodejs.org/ からダウンロードしてインストールする
- **Git**: https://git-scm.com/downloads からインストールする
  - Gitを入れたくない場合は、このページ上部の緑の「Code」ボタン →「Download ZIP」でも代用できます。展開したフォルダで以降の手順を行ってください
- コマンドを打つ画面を開く: **WindowsはPowerShell**（スタートメニューで「PowerShell」を検索）、**Macはターミナル**。以降のコマンドはすべてこの画面に貼り付けて Enter で実行します

### 手順1: Cloudflareの無料アカウントを作る

https://dash.cloudflare.com/sign-up でメールアドレスだけで作れます（クレジットカード不要）。タニメモの本体とデータは、この「あなたのアカウント」の上で動きます。

### 手順2: コマンドを順番に実行する

1行ずつ（`#` で始まる説明行は除く）貼り付けて実行してください。

```bash
# --- 設計図を手元にコピーして、部品を揃える ---
git clone https://github.com/tany4417-png/tanimemo.git
cd tanimemo/app
npm install
cd ../worker
npm install

# --- Cloudflareに接続する（ブラウザが開くのでログインして「Allow」を押す） ---
npx wrangler login

# --- メモ置き場（D1）と画像置き場（R2）をあなたのアカウントに作る ---
npx wrangler d1 create tanimemo
#   ↑実行すると database_id = "xxxx..." という行が表示される。
#    worker/wrangler.jsonc をメモ帳で開き、database_id の値をそのxxxxに書き換えて保存する
npx wrangler r2 bucket create tanimemo-att

# --- メモ置き場の中身（テーブル）を作る ---
npx wrangler d1 migrations apply tanimemo --remote

# --- 合言葉（APIトークン)を決める。長いランダム文字列を作って貼り付ける ---
#    生成例 Mac: openssl rand -base64 33
#    生成例 Windows PowerShell: -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 44 | % {[char]$_})
#    ※生成した文字列は後でスマホにも入力するので、いったんメモしておく
npx wrangler secret put API_TOKEN

# --- アプリを組み立てて、あなたのCloudflareへ配置する ---
cd ../app
npm run build
cd ../worker
npx wrangler deploy
#   ↑最後に https://tanimemo.<あなたのサブドメイン>.workers.dev と表示されたら完成。
#    これがあなた専用のタニメモのURL
```

### 手順3: スマホとPCで使えるようにする

1. 表示されたURLをブラウザで開く
2. 右上の「設定」を開き、手順2で決めたAPIトークンを貼り付けて保存する（これで同期が動き出す）
3. スマホは共有メニューの「ホーム画面に追加」でアプリとしてインストールする
4. iPhoneの共有シート（SafariのURLや写真を2タップで送る機能）を使う場合は [docs/ios-shortcut-setup.md](docs/ios-shortcut-setup.md) の手順を行う

### つまずいたら

- `npm` や `git` が「見つかりません」と出る → インストール後にPowerShell（ターミナル）を一度閉じて開き直す
- `wrangler login` で開いたブラウザ → Cloudflareにログインして「Allow」を押せば、元の画面に戻って続行される
- `wrangler deploy` で database_id 関連のエラー → 手順2の「wrangler.jsonc の書き換え」を確認する
- アプリは開くが「同期エラー」→ 設定画面のトークンが手順2で設定した値と一致しているか確認する

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
