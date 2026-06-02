#!/usr/bin/env bash
# pre-pr-check 同梱: 差分にシークレットの「実値」が混入していないか走査する（高シグナルのみ）。
# 変数名だけの .env.example は誤検知しない設計。検出したら非ゼロ終了。
# 公開リポジトリ運用（CLAUDE.md 重要な制約 7）の最終ゲート。
set -u
fail=0

# (1) .gitignore 対象のシークレットファイルがステージされていないか
while IFS= read -r f; do
  [ -z "$f" ] && continue
  b=$(basename -- "$f")
  [ "$b" = ".env.example" ] && continue
  case "$b" in
    .dev.vars | .dev.vars.production | .env | .env.* | service-account-*.json | *-service-account.json | *.key.json)
      echo "❌ secret file staged: $f"
      fail=1
      ;;
  esac
done < <(git diff --cached --name-only 2>/dev/null)

# (2) 差分本文に実シークレットの痕跡（変数名のみの行は対象外）
diff=$(git diff --cached 2>/dev/null)
[ -n "$diff" ] || diff=$(git diff 2>/dev/null)

if printf '%s\n' "$diff" | grep -qE -- '-----BEGIN[[:space:]]+([A-Z]+[[:space:]]+)?PRIVATE KEY-----'; then
  echo "❌ private key material detected in diff"
  fail=1
fi
if printf '%s\n' "$diff" | grep -qE '"private_key"[[:space:]]*:|"type"[[:space:]]*:[[:space:]]*"service_account"'; then
  echo "❌ service-account JSON content detected in diff"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "→ CLAUDE.md 重要な制約 7（公開リポジトリ運用）を確認してください。"
  exit 1
fi
echo "✅ no secret material detected in diff"
exit 0
