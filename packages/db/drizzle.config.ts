import { defineConfig } from 'drizzle-kit';

// マイグレーション SQL の生成のみを drizzle-kit に任せる。
// 適用は apps/api で `wrangler d1 migrations apply tecnova-db --local|--remote` を使う。
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
});
