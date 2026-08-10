# Capacity Atlas

**すべてのAI容量を、ひとつの画面に。**

Capacity Atlasは、GPT / OpenAI Codex、Claude、Grokの残容量、リセット日時、認証状態を一画面で確認するローカルファーストのオープンソース管理ツールです。

自動アカウント切替、プロンプト転送、モデル通信のリレーは行いません。

![Capacity Atlas dashboard](docs/assets/dashboard.png)

## Download

Node.jsや各社CLIの事前インストールは不要です。

- [macOS Apple Silicon版をダウンロード](https://github.com/meem0601/capacity-atlas/releases/latest/download/Capacity-Atlas-Connector-macOS-arm64.zip)
- [Windows x64版をダウンロード](https://github.com/meem0601/capacity-atlas/releases/latest/download/Capacity-Atlas-Connector-Windows-x64.zip)
- [すべてのReleaseを見る](https://github.com/meem0601/capacity-atlas/releases)

Connectorを起動し、ブラウザで「アカウントを追加」を押してOAuth認証するだけで利用できます。

## 特徴

- 起動直後に、接続済みアカウントの残容量とリセット時刻を表示
- OpenAI、Claude、GrokのブラウザOAuthをConnectorから開始
- 同一プロバイダー・同一アカウントの重複接続を1枚へ集約
- Capacity Atlasが作成した管理接続だけを安全に解除
- macOS KeychainおよびWindows / Linuxの保護された認証ファイルに対応
- 認証状態と、一時的な利用枠APIエラーを分離
- ホストされたUIへトークン、Cookie、実利用枠を送信しない

## 構成

1. **Web UI** — 静的なダッシュボード。公開版は <https://capacity-atlas.vercel.app>。
2. **Capacity Atlas Connector** — 各PCの `127.0.0.1:4174` のみで待ち受け、ローカル認証と利用枠取得を担当。
3. **プロバイダー認証** — 「アカウントを追加」からOAuth URLをブラウザで開き、各サービス上で許可。利用者がトークンを貼り付ける必要はありません。

## 対応状況

| サービス | 利用枠取得 | 複数アカウント | 新規認証 |
| --- | --- | --- | --- |
| GPT / Codex | 直接取得 | 分離プロファイル | OpenAIブラウザOAuth |
| Claude | ベストエフォート | 現行版は端末のアクティブな1アカウント | ClaudeブラウザOAuth |
| Grok | ベストエフォート | 現行版は端末のアクティブな1アカウント | xAIブラウザOAuth |

GPT / Codexの認証ヘルパーは配布パッケージへ同梱します。ClaudeとGrokは、初回接続時に各社の公式配布元からConnector専用領域へ取得し、プラットフォーム署名・チェックサムを検証します。

> [!IMPORTANT]
> 各社の残容量取得には、正式な第三者向け安定APIではない部分があります。プロバイダー側の仕様変更により一時的または恒久的に取得できなくなる可能性があります。認証成功と利用枠取得成功は別状態として扱います。

## 開発

必要環境：Node.js 20以上。

```bash
npm ci
npm run check
npm test
npm run build
npm start
```

ローカル画面は <http://127.0.0.1:4174> です。UIは60秒間隔で更新し、Connectorは同一結果を最大60秒キャッシュします。

## 再現可能な配布ビルド

```bash
npm run build:release
```

このコマンドは次を行います。

1. `vendor/codex/artifacts.json` に固定したOpenAI公式リリースを取得
2. 公式SHA-256と照合
3. macOS arm64 / Windows x64 Connectorを生成
4. `release/` に配布ZIPを作成

生成済みバイナリ、`release/`、`dist/`、ローカル設定、認証情報はGitへ含めません。

## 安全設計

- Connectorはloopback（`127.0.0.1`）だけで待ち受けます。
- APIのWeb Originは公開版Capacity Atlasとlocalhostだけを許可します。
- 認証出力はトークン形式をマスクしてからUIへ返します。
- 公開Web版は `/api/status` を持たず、認証情報・実アカウントデータを保存しません。
- ブラウザへOAuthトークンを入力・保存させません。
- 通常のOpenAI / Claude / Grok CLI認証は削除しません。Capacity Atlas管理プロフィールだけが解除対象です。

脆弱性報告については [SECURITY.md](SECURITY.md) を参照してください。

## Contributing

IssueとPull Requestを歓迎します。変更前に [CONTRIBUTING.md](CONTRIBUTING.md) を確認してください。

## Attribution

利用枠取得ロジックの調査・移植に、MIT Licenseの[CodexBar](https://github.com/steipete/CodexBar)を参照しています。配布パッケージにはApache-2.0のOpenAI Codex CLIを含みます。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

OpenAI、Claude、Grokおよび各ロゴは各権利者の商標です。Capacity Atlasは各社の公式製品ではなく、各社による承認・提携を示すものではありません。

## License

[MIT License](LICENSE)
