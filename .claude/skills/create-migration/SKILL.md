---
name: create-migration
description: Generate and apply a Drizzle/D1 migration for tecnova-platform. Use when editing packages/db/src/schema.ts, adding or changing a table/column, or when the user asks to create or run a DB migration.
---

# create-migration

tecnova-platform の DB マイグレーションは **packages/db と apps/api をまたぐ 2 段構え**で、
順序を間違えやすい。drizzle-kit は **SQL 生成のみ**を担当し、適用は wrangler（D1）で行う
（`packages/db/drizzle.config.ts` のコメント参照）。この手順を厳守すること。

## 前提・制約
- スキーマ: `packages/db/src/schema.ts`（生成 SQL は `packages/db/drizzle/` に出力、`meta/_journal.json` で管理）。
- `apps/api/wrangler.toml` の `migrations_dir = ../../packages/db/drizzle`。
- タイムスタンプは **UTC の Unix epoch ms**（`integer({ mode: 'timestamp_ms' })`）。`Date` 列は使わない（CLAUDE.md 制約 6）。
- 書き込み整合性は **D1 saga / `db.batch([...])`** パターン（インタラクティブ・トランザクション不可、CLAUDE.md 制約 4 / docs/mvp.md 6.1）。

## 手順
1. **スキーマ編集**: `packages/db/src/schema.ts` を変更する。既存行のある列に NOT NULL を足す場合は default を検討（例: `fullName` は `default('')`）。
2. **SQL 生成**:
   ```bash
   pnpm --filter @tecnova/db db:generate
   ```
3. **生成物レビュー**: `packages/db/drizzle/NNNN_*.sql` と `meta/_journal.json` の差分を読み、新規エントリが**ちょうど 1 つ**であること、SQL が意図通りかを確認する。破壊的変更（列削除・型変更）は特に慎重に。
4. **ローカル D1 へ適用**:
   ```bash
   pnpm --filter @tecnova/api db:apply:local
   ```
5. **型チェック**:
   ```bash
   pnpm --filter @tecnova/api type-check
   pnpm --filter @tecnova/db type-check
   ```
6. **本番（remote）は原則自動**: `db:apply:remote` は `main` への push 時に `.github/workflows/deploy-api.yml` が実行する。**ここで手動の `db:apply:remote` は実行しない**。明示的に求められた場合のみ:
   ```bash
   pnpm --filter @tecnova/api db:apply:remote
   ```

## 完了条件
- 生成 SQL をレビュー済み、ローカル D1 に適用済み、型チェック通過。
- スキーマ変更が participants の PII 境界（CLAUDE.md 制約 5）を超えていないこと。`participants` への列追加を伴う場合は **privacy-reviewer サブエージェント**に確認させる。
