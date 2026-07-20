# タニメモ

自分用メモPWA。オフラインで読み書きでき、iPhoneとPCの間でURL・画像を受け渡せる。

- 要件: `~/.company/engineering/docs/メモ帳アプリ-要件定義.md`
- 実装計画: `~/.company/engineering/docs/タニメモ-実装計画.md`

## 開発

- App: `cd app; npm run dev`（http://localhost:5173、/api は 8787 へproxy）
- Worker: `cd worker; npx wrangler dev`（http://127.0.0.1:8787、ローカルトークンは .dev.vars）
- テスト: 各ディレクトリで `npm test`
