import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// 適用済みのマイグレーションは d1_migrations テーブルで記録されるので、ファイルごとに呼んでも重複しない。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
