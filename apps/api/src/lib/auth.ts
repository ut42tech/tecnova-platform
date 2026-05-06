import * as schema from '@tecnova/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';

interface Env {
  DB: D1Database;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  TRUSTED_ORIGINS: string;
}

// `TRUSTED_ORIGINS` はカンマ区切りの文字列。Worker Secrets / `.dev.vars` で設定する。
// 本番ドメインはコミットしないため、コード側にデフォルト値は持たない。
export const parseTrustedOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Cloudflare Workers では betterAuth instance をグローバルに保持しない
// （D1 接続まわりでロックを掴んだままのリクエストが残るとハングするため）。
// リクエスト毎にこのファクトリを呼んで使い切る。
//
// docs/mvp.md 11.1 / CLAUDE.md「重要な制約 2」参照。
export const createAuth = (env: Env) => {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // D1 はインタラクティブ・トランザクションを持たないので false。
      transaction: false,
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      },
    },
    // 管理画面（apps/admin）と受付アプリ（apps/checkin）からの cross-origin
    // リクエストを許可する。開発時は `http://localhost:3000` と
    // `http://localhost:3001` を `TRUSTED_ORIGINS` に含めること。
    trustedOrigins: parseTrustedOrigins(env.TRUSTED_ORIGINS),
  });
};

export type Auth = ReturnType<typeof createAuth>;
