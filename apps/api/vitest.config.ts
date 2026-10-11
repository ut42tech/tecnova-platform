import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// このファイルは Node で動く（Worker 本体 src/ の Node API 禁止ルールの対象外）。
// 本番と同じ wrangler.toml の D1 binding を使い、packages/db のマイグレーションを
// テスト専用 binding（TEST_MIGRATIONS）で setup ファイルへ渡して適用する。
const migrationsDir = fileURLToPath(new URL('../../packages/db/drizzle', import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations(migrationsDir) },
      },
    })),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
