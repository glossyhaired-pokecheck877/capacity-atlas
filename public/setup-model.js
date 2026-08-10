const GUIDES = {
  codex: {
    title: "GPT / Codex",
    capability: "複数アカウント対応",
    actionLabel: "OpenAIログインを始める",
    steps: [
      "下のボタンを押すと、OpenAIの公式ログイン画面が開きます。",
      "Capacity Atlasで使いたいアカウントを選んでログインします。",
      "ログイン後は自動で接続されます。コードの入力は必要ありません。"
    ],
    note: "パスワード・OAuthトークンはWeb画面やVercelへ送信されず、このPC内だけに保存されます。"
  },
  claude: {
    title: "Claude",
    capability: "ブラウザOAuth接続",
    actionLabel: "Claudeへ接続",
    steps: [
      "初回だけ、Capacity Atlas ConnectorがClaudeの公式認証機能を自動で準備します。事前インストールは不要です。",
      "Anthropicの公式ログイン画面で、Capacity Atlasに追加するFree・Pro・Max等のClaudeアカウントを選びます。",
      "ログイン後は自動で接続されます。コードの入力は必要ありません。"
    ],
    note: "非公式連携です。パスワード・OAuthトークン・利用枠はこのPC内だけで扱い、Vercelへ送信しません。"
  },
  grok: {
    title: "Grok",
    capability: "現在のアカウントを接続",
    actionLabel: "Grokを再接続",
    steps: [
      "Capacity Atlas Connectorが、Grokの公式ログイン画面を開きます。",
      "Capacity Atlasで使いたいxAIアカウントを選んでログインします。",
      "ログイン後は自動で接続されます。コードの入力は必要ありません。"
    ],
    note: "現行Grok CLIでは正式な認証ホーム分離を確認できないため、初版の複数アカウント分離は未対応です。"
  }
};

export function setupGuide(provider) {
  return GUIDES[provider] ?? null;
}

export function loginOpenedLabel(provider) {
  const serviceName = { codex: "OpenAI", claude: "Claude", grok: "Grok" }[provider] || "AIサービス";
  return `${serviceName}のログイン画面を開きました`;
}
