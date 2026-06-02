#!/usr/bin/env bash
# PreToolUse(Edit|MultiEdit|Write) hook
# 目的: 公開リポジトリにシークレットを書き込ませない最終ガード。
#       CLAUDE.md「重要な制約 7」/ .gitignore で禁止されたファイルへの
#       Edit/Write を deny する（permissionDecision 方式・exit 0）。
# 方針: jq 不在やパース失敗時は fail-open（作業を止めない）。本ガードは
#       .gitignore + レビューを補完するバックストップであり、唯一の防壁ではない。

input=$(cat)

# jq が無ければ判定不能 → 通す（誤ブロックで作業を止めない）
command -v jq >/dev/null 2>&1 || exit 0

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0
base=$(basename -- "$file")

deny() {
  # 理由文を JSON 文字列として安全にエンコード（改行・引用符対応）
  local reason
  reason=$(printf '%s' "$1" | jq -Rs .)
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$reason"
  exit 0
}

# 大文字小文字を区別せずに判定する（.ENV や .DEV.VARS のような変種も塞ぐ）
shopt -s nocasematch

case "$base" in
  # 変数名のみのテンプレートは許可
  .env.example)
    : ;;
  # wrangler は .dev.vars.<env>（.dev.vars.production / .dev.vars.staging 等）も使うため全変種を deny
  .dev.vars | .dev.vars.*)
    deny "Blocked: ${base} はシークレットファイル（.gitignore 対象）です。公開リポジトリには絶対にコミットしないでください（CLAUDE.md 重要な制約 7）。シークレットは 'wrangler secret put' / Vercel 環境変数で管理し、.env.example には変数名のみ記載します。" ;;
  .env | .env.*)
    deny "Blocked: ${base} は環境変数シークレット（.gitignore 対象）です。編集可能なのは .env.example のみです（CLAUDE.md 重要な制約 7）。" ;;
  service-account-*.json | *-service-account.json | *.key.json)
    deny "Blocked: ${base} は Google サービスアカウント鍵に見えます。生 JSON 鍵はコミット禁止です（CLAUDE.md 重要な制約 3/7）。base64 化して GOOGLE_SERVICE_ACCOUNT_KEY として wrangler secret に格納してください。" ;;
  pnpm-lock.yaml)
    deny "Blocked: pnpm-lock.yaml は手編集しないでください。'pnpm install' で再生成します（CI は --frozen-lockfile）。" ;;
esac

exit 0
