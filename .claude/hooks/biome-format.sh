#!/usr/bin/env bash
# PostToolUse(Edit|MultiEdit|Write) hook
# 目的: 編集したファイルだけを Biome で整形・自動修正し、CI（`pnpm lint` =
#       biome check .）を常にグリーンに保つ。import 整理も自動化される。
# 方針: 失敗してもエージェントの作業は止めない（fail-open / 常に exit 0）。
#       biome.json が .claude/ や packages/db/drizzle を無視するため、それらは自動でスキップ。

input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.json | *.jsonc | *.css)
    cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
    # 単一ファイルのみ整形。未対応/無視パスは --no-errors-on-unmatched で握りつぶす。
    pnpm biome check --write --no-errors-on-unmatched "$file" >/dev/null 2>&1 || true
    ;;
esac
exit 0
