---
name: pre-pr-check
description: Pre-PR verification gate for tecnova-platform. Use before committing, opening a PR, or claiming work is complete — runs the local equivalent of CI (Biome + type-check), the shared tests CI does not run, and a secret/PII scan for this public repo.
---

# pre-pr-check

公開リポジトリ（子どもの PII を扱う）かつ git hook が無く、CI は Biome + 型チェックのみ。
`@tecnova/shared` の Vitest は CI にも turbo にも載っていない。よって「完了」と宣言する前に
ローカルでこのゲートを通すこと。`superpowers:verification-before-completion` の実体。

## チェックリスト
1. **Lint/Format（CI の `pnpm lint` 相当）**:
   ```bash
   pnpm biome check .
   ```
   失敗したら `pnpm biome check --write .` で修正し、再度 `pnpm biome check .`。
2. **型チェック（CI が実行）**:
   ```bash
   pnpm type-check
   ```
3. **テスト（CI は実行しない・shared を触ったら必須）**:
   ```bash
   pnpm --filter @tecnova/shared test
   ```
4. **シークレット/PII 走査**（このスキルに同梱）:
   ```bash
   .claude/skills/pre-pr-check/scripts/scan-secrets.sh
   ```
   非ゼロ終了なら混入の疑い。CLAUDE.md「重要な制約 7」を確認し、除去するまでコミットしない。
5. **ブランチ確認**: `main` / `develop` 直コミットでないこと。小さい論理単位でコミットし、英語メッセージ（`<type>: <subject>`）+ Co-Authored-By トレーラを付ける。
6. **デプロイ影響の確認**: `apps/api` または `packages/{db,shared}` を変更した場合、`main` へのマージで `deploy-api.yml` が走り **本番 Workers デプロイ + remote D1 マイグレーション**が実行される。マイグレーションの妥当性を再確認する。

## 完了条件
- 1〜4 がすべてグリーン、5〜6 を確認済み。これで初めて「CI 通過見込み・シークレット混入なし」と宣言できる。
